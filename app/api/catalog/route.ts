import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { listPublishedProducts } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { products: listPublishedProducts() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}