import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/server/api";
import { writeAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/auth";
import { randomToken } from "@/lib/server/crypto";

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "product.write");
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      throw new ApiError(400, "missing_file", "请选择商品图片");
    }
    if (!(file instanceof File)) throw new ApiError(400, "invalid_file", "图片文件无效");
    const extension = EXTENSIONS[file.type];
    if (!extension) throw new ApiError(415, "unsupported_image", "仅支持 JPG、PNG、WebP 或 GIF 图片");
    if (file.size < 1 || file.size > MAX_BYTES) throw new ApiError(413, "image_too_large", "图片大小必须在 5MB 以内");

    const directory = join(process.cwd(), "data", "uploads", "products");
    mkdirSync(directory, { recursive: true });
    const filename = `${randomToken(18).replace(/[^a-zA-Z0-9_-]/g, "")}.${extension}`;
    writeFileSync(join(directory, filename), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    const path = `/api/product-images/${filename}`;
    writeAudit(actor.id, "product.image_upload", "asset", filename, { size: file.size, type: file.type });
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}