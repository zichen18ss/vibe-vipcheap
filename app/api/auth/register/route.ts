import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, clientIp, getString, normalizeEmail, readJson } from "@/lib/server/api";
import { createSession, setSessionCookie } from "@/lib/server/auth";
import { hashPassword, randomId } from "@/lib/server/crypto";
import { getDb, transaction } from "@/lib/server/db";
import { checkRateLimit } from "@/lib/server/rate-limit";

type Body = { email?: unknown; password?: unknown; name?: unknown };

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const limit = checkRateLimit(`register:${clientIp(request)}`, 8, 15 * 60_000);
    if (!limit.allowed) throw new ApiError(429, "rate_limited", "注册请求过于频繁，请稍后再试");

    const body = await readJson<Body>(request);
    const email = normalizeEmail(body.email);
    const password = getString(body.password, "密码", 8, 128);
    const name = getString(body.name, "用户名", 2, 40);

    const user = transaction(() => {
      const existing = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) throw new ApiError(409, "email_exists", "该邮箱已注册");
      const id = randomId("usr");
      const now = Date.now();
      getDb().prepare(
        "INSERT INTO users (id, email, password_hash, name, role, points, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'customer', 0, 1, ?, ?)",
      ).run(id, email, hashPassword(password), name, now, now);
      getDb().prepare(
        "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, 'user.register', 'user', ?, NULL, ?)",
      ).run(randomId("aud"), id, id, now);
      return { id, email, name, role: "customer" as const, points: 0, permissions: [], isSuperAdmin: false, createdAt: now };
    });

    const session = createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
