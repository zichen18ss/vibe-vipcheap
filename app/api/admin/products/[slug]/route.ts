import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/server/api";
import { writeAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/auth";
import {
  deleteDraftProduct,
  getAdminProduct,
  normalizeProductWriteInput,
  updateProduct,
} from "@/lib/server/catalog";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    requirePermission(request, "product.read");
    const { slug } = await context.params;
    const product = getAdminProduct(slug);
    if (!product) throw new ApiError(404, "product_not_found", "商品不存在");
    return NextResponse.json({ product });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "product.write");
    const { slug } = await context.params;
    const body = await readJson<Record<string, unknown>>(request);
    const input = normalizeProductWriteInput({ ...body, slug: body.slug ?? slug });
    const product = updateProduct(slug, input);
    writeAudit(actor.id, "product.update", "product", product.slug, {
      previousSlug: slug,
      status: product.status,
      variants: product.variants.length,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "product.write");
    const { slug } = await context.params;
    deleteDraftProduct(slug);
    writeAudit(actor.id, "product.delete", "product", slug, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}