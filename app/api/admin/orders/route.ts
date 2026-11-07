import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { listAllOrders } from "@/lib/server/orders";

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request);
    const status = request.nextUrl.searchParams.get("status") || undefined;
    return NextResponse.json({ orders: listAllOrders(status) });
  } catch (error) {
    return apiError(error);
  }
}
