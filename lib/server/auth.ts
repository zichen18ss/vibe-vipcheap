import type { NextRequest, NextResponse } from "next/server";
import { FULL_ADMIN_PERMISSIONS, normalizePermissions, type AdminPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/server/api";
import { hashToken, randomId, randomToken } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";

export const SESSION_COOKIE = "vc_session";
export const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "customer" | "admin";
  points: number;
  permissions: AdminPermission[];
  isSuperAdmin: boolean;
  createdAt: number;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "customer" | "admin";
  points: number;
  permissions: string;
  is_super_admin: number;
  created_at: number;
};

function permissionsFor(row: UserRow): AdminPermission[] {
  if (row.role !== "admin") return [];
  if (row.is_super_admin) return FULL_ADMIN_PERMISSIONS;
  try {
    return normalizePermissions(JSON.parse(row.permissions || "[]"));
  } catch {
    return [];
  }
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    points: row.points,
    permissions: permissionsFor(row),
    isSuperAdmin: Boolean(row.is_super_admin),
    createdAt: row.created_at,
  };
}

export function hasPermission(user: AuthUser, permission: AdminPermission): boolean {
  return user.role === "admin" && (user.isSuperAdmin || user.permissions.includes(permission));
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_AGE_SECONDS * 1000;
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomId("ses"), userId, hashToken(token), expiresAt, Date.now());
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: 0,
  });
}

export function getSessionUser(request: NextRequest): AuthUser | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.id, u.email, u.name, u.role, u.points, u.permissions, u.is_super_admin, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(hashToken(token), Date.now()) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function requireUser(request: NextRequest): AuthUser {
  const user = getSessionUser(request);
  if (!user) throw new ApiError(401, "unauthorized", "请先登录");
  return user;
}

export function requireAdmin(request: NextRequest): AuthUser {
  const user = requireUser(request);
  if (user.role !== "admin") throw new ApiError(403, "forbidden", "需要管理员权限");
  return user;
}

export function requirePermission(request: NextRequest, permission: AdminPermission): AuthUser {
  const user = requireAdmin(request);
  if (!hasPermission(user, permission)) {
    throw new ApiError(403, "permission_denied", "当前管理员没有执行该操作的权限");
  }
  return user;
}

export function revokeSession(request: NextRequest): void {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function serializeUser(row: Omit<UserRow, "permissions" | "is_super_admin"> & Partial<Pick<UserRow, "permissions" | "is_super_admin">>): AuthUser {
  return mapUser({
    ...row,
    permissions: row.permissions || "[]",
    is_super_admin: row.is_super_admin || 0,
  });
}