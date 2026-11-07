import { NextRequest, NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/server/api";
import { clearSessionCookie, revokeSession } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    revokeSession(request);
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
