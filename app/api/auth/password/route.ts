import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, getString, readJson } from "@/lib/server/api";
import { createSession, requireUser, revokeSession, setSessionCookie } from "@/lib/server/auth";
import { hashPassword, verifyPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";

type Body = { currentPassword?: unknown; newPassword?: unknown };

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const body = await readJson<Body>(request);
    const currentPassword = getString(body.currentPassword, "当前密码", 1, 128);
    const newPassword = getString(body.newPassword, "新密码", 8, 128);
    if (currentPassword === newPassword) throw new ApiError(400, "same_password", "新密码不能与当前密码相同");

    const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      throw new ApiError(400, "invalid_password", "当前密码错误");
    }

    getDb().prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(newPassword), Date.now(), user.id);
    revokeSession(request);
    const session = createSession(user.id);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
