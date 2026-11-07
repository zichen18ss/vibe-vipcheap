import { NextRequest, NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[api]", error);
  return NextResponse.json({ error: "服务器内部错误", code: "internal_error" }, { status: 500 });
}

export async function readJson<T>(request: NextRequest): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "请求必须使用 application/json");
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "请求正文不是有效 JSON");
  }
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ApiError(403, "invalid_origin", "请求来源无效");
    }
    const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    if (originHost !== requestHost) throw new ApiError(403, "origin_mismatch", "不允许跨站写入请求");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "cross_site_request", "不允许跨站写入请求");
  }
}

export function getString(value: unknown, field: string, min = 1, max = 200): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_input", `${field} 必须是字符串`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(400, "invalid_input", `${field} 长度必须为 ${min}-${max} 个字符`);
  }
  return normalized;
}

export function getInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, "invalid_input", `${field} 必须是 ${min}-${max} 之间的整数`);
  }
  return value;
}

export function normalizeEmail(value: unknown): string {
  const email = getString(value, "邮箱", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid_email", "请输入有效邮箱");
  }
  return email;
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
