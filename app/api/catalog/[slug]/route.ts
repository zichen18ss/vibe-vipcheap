import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/server/api";
import { getPublishedProduct } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const product = getPublishedProduct(slug);
    if (!product) throw new ApiError(404, "product_not_found", "商品不存在或尚未上架");
    return NextResponse.json({ product }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}