import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, clientIp, getString, normalizeEmail, readJson } from "@/lib/server/api";
import { createSession, serializeUser, setSessionCookie } from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { checkRateLimit } from "@/lib/server/rate-limit";

type Body = { email?: unknown; password?: unknown };
type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "customer" | "admin";
  points: number;
  active: number;
  permissions: string;
  is_super_admin: number;
  created_at: number;
};

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Body>(request);
    const email = normalizeEmail(body.email);
    const password = getString(body.password, "密码", 1, 128);
    const limit = checkRateLimit(`login:${clientIp(request)}:${email}`, 10, 15 * 60_000);
    if (!limit.allowed) throw new ApiError(429, "rate_limited", "登录尝试过多，请稍后再试");

    const row = getDb().prepare(
      "SELECT id, email, password_hash, name, role, points, active, permissions, is_super_admin, created_at FROM users WHERE email = ?",
    ).get(email) as UserRow | undefined;
    if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
      throw new ApiError(401, "invalid_credentials", "邮箱或密码错误");
    }

    const session = createSession(row.id);
    const response = NextResponse.json({ user: serializeUser(row) });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
