import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

type UserRow = {
  id: string; email: string; name: string; role: "customer" | "admin";
  points: number; active: number; created_at: number; updated_at: number;
};

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request);
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const rows = query
      ? getDb().prepare("SELECT * FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 200").all(`%${query}%`, `%${query}%`) as UserRow[]
      : getDb().prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 200").all() as UserRow[];
    return NextResponse.json({
      users: rows.map((row) => ({
        id: row.id, email: row.email, name: row.name, role: row.role,
        points: row.points, active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
