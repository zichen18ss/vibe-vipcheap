import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { getSessionUser } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ user: getSessionUser(request) });
  } catch (error) {
    return apiError(error);
  }
}
