import { NextRequest, NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/server/api";
import { writeAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/auth";
import { publishProduct } from "@/lib/server/catalog";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "product.publish");
    const { slug } = await context.params;
    const product = publishProduct(slug);
    writeAudit(actor.id, "product.publish", "product", product.slug, {
      status: product.status,
      publishedAt: product.publishedAt,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return apiError(error);
  }
}