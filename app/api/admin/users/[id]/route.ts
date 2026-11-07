import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, getString, readJson } from "@/lib/server/api";
import { writeAudit } from "@/lib/server/audit";
import { hasPermission, requirePermission, type AuthUser } from "@/lib/server/auth";
import { hashPassword, randomId } from "@/lib/server/crypto";
import { getDb, transaction } from "@/lib/server/db";
import { normalizePermissions } from "@/lib/permissions";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "customer" | "admin";
  points: number;
  active: number;
  permissions: string;
  is_super_admin: number;
  created_at: number;
  updated_at: number;
};

function storedPermissions(row: UserRow) {
  if (row.role !== "admin") return [];
  if (row.is_super_admin) {
    return normalizePermissions(
      (() => {
        try { return JSON.parse(row.permissions || "[]"); } catch { return []; }
      })(),
    );
  }
  try { return normalizePermissions(JSON.parse(row.permissions || "[]")); } catch { return []; }
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    points: row.points,
    active: Boolean(row.active),
    permissions: storedPermissions(row),
    isSuperAdmin: Boolean(row.is_super_admin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireAdminWrite(actor: AuthUser) {
  if (!hasPermission(actor, "admin.write")) {
    throw new ApiError(403, "permission_denied", "当前管理员没有分配权限的权限");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "user.write");
    const { id } = await context.params;
    const body = await readJson<{
      name?: unknown;
      role?: unknown;
      active?: unknown;
      pointsDelta?: unknown;
      resetPassword?: unknown;
      permissions?: unknown;
      isSuperAdmin?: unknown;
    }>(request);

    const controlsAdmin = body.role !== undefined || body.permissions !== undefined || body.isSuperAdmin !== undefined;
    if (controlsAdmin) requireAdminWrite(actor);

    const user = transaction(() => {
      const db = getDb();
      const current = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
      if (!current) throw new ApiError(404, "user_not_found", "用户不存在");
      if (current.is_super_admin && !actor.isSuperAdmin) {
        throw new ApiError(403, "super_admin_required", "只有超级管理员可以修改超级管理员账号");
      }
      if (id === actor.id && (body.active === false || body.role === "customer" || body.isSuperAdmin === false)) {
        throw new ApiError(400, "self_lockout", "不能停用、降级或撤销自己的超级管理员身份");
      }
      if (body.isSuperAdmin !== undefined && !actor.isSuperAdmin) {
        throw new ApiError(403, "super_admin_required", "只有超级管理员可以授予超级管理员身份");
      }

      const now = Date.now();
      let nextRole = current.role;
      let nextPermissions = storedPermissions(current);
      let nextSuperAdmin = Boolean(current.is_super_admin);

      if (body.name !== undefined) {
        const name = getString(body.name, "用户名", 2, 40);
        db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(name, now, id);
      }
      if (body.role !== undefined) {
        if (body.role !== "customer" && body.role !== "admin") throw new ApiError(400, "invalid_role", "用户角色无效");
        nextRole = body.role;
        if (nextRole === "customer") {
          nextPermissions = [];
          nextSuperAdmin = false;
        }
        if (current.role === "admin" && nextRole === "customer") {
          const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get() as { count: number };
          if (admins.count <= 1) throw new ApiError(409, "last_admin", "不能移除最后一个管理员");
        }
      }
      if (body.permissions !== undefined) {
        if (nextRole !== "admin") throw new ApiError(400, "invalid_role", "普通用户不能分配管理员权限");
        nextPermissions = normalizePermissions(body.permissions);
        if (id === actor.id && !nextSuperAdmin && !nextPermissions.includes("admin.write")) {
          throw new ApiError(400, "self_lockout", "不能移除自己的权限分配能力");
        }
      }
      if (body.isSuperAdmin !== undefined) {
        if (typeof body.isSuperAdmin !== "boolean") throw new ApiError(400, "invalid_super_admin", "超级管理员状态无效");
        if (body.isSuperAdmin && nextRole !== "admin") throw new ApiError(400, "invalid_super_admin", "只有管理员可以被设为超级管理员");
        nextSuperAdmin = body.isSuperAdmin;
      }
      if (current.is_super_admin && !nextSuperAdmin) {
        const superAdmins = db.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1 AND is_super_admin = 1",
        ).get() as { count: number };
        if (superAdmins.count <= 1) throw new ApiError(409, "last_super_admin", "不能撤销最后一个有效超级管理员");
      }
      if (current.role !== nextRole || current.permissions !== JSON.stringify(nextPermissions) || Boolean(current.is_super_admin) !== nextSuperAdmin) {
        db.prepare("UPDATE users SET role = ?, permissions = ?, is_super_admin = ?, updated_at = ? WHERE id = ?")
          .run(nextRole, JSON.stringify(nextPermissions), nextSuperAdmin ? 1 : 0, now, id);
      }
      if (body.active !== undefined) {
        if (typeof body.active !== "boolean") throw new ApiError(400, "invalid_active", "账号状态无效");
        if (!body.active && current.active && current.is_super_admin) {
          const superAdmins = db.prepare(
            "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1 AND is_super_admin = 1",
          ).get() as { count: number };
          if (superAdmins.count <= 1) throw new ApiError(409, "last_super_admin", "不能停用最后一个有效超级管理员");
        }
        db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").run(body.active ? 1 : 0, now, id);
        if (!body.active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      }
      if (body.pointsDelta !== undefined) {
        if (typeof body.pointsDelta !== "number" || !Number.isInteger(body.pointsDelta) || Math.abs(body.pointsDelta) > 1_000_000) {
          throw new ApiError(400, "invalid_points_delta", "积分调整值无效");
        }
        const nextPoints = current.points + body.pointsDelta;
        if (nextPoints < 0) throw new ApiError(400, "points_below_zero", "用户积分不能小于 0");
        db.prepare("UPDATE users SET points = ?, updated_at = ? WHERE id = ?").run(nextPoints, now, id);
        db.prepare(
          "INSERT INTO points_ledger (id, user_id, delta, reason, order_id, created_at) VALUES (?, ?, ?, '管理员调整', NULL, ?)",
        ).run(randomId("pts"), id, body.pointsDelta, now);
      }
      if (body.resetPassword !== undefined) {
        const nextPassword = getString(body.resetPassword, "新密码", 8, 128);
        db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(nextPassword), now, id);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      }
      writeAudit(actor.id, "user.admin_update", "user", id, {
        role: nextRole,
        active: body.active,
        pointsDelta: body.pointsDelta,
        permissions: nextPermissions,
        isSuperAdmin: nextSuperAdmin,
      });
      return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
    });
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    return apiError(error);
  }
}