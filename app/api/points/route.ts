import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request);
    const ledger = getDb().prepare(
      "SELECT id, delta, reason, order_id, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    ).all(user.id) as Array<{ id: string; delta: number; reason: string; order_id: string | null; created_at: number }>;
    return NextResponse.json({
      balance: user.points,
      ledger: ledger.map((entry) => ({ id: entry.id, delta: entry.delta, reason: entry.reason, orderId: entry.order_id, createdAt: entry.created_at })),
    });
  } catch (error) {
    return apiError(error);
  }
}
