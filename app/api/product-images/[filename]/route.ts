import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/server/api";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    if (!/^[a-zA-Z0-9_-]{16,80}\.(?:jpg|png|webp|gif)$/.test(filename)) {
      throw new ApiError(404, "image_not_found", "图片不存在");
    }
    const path = join(process.cwd(), "data", "uploads", "products", filename);
    if (!existsSync(path)) throw new ApiError(404, "image_not_found", "图片不存在");
    const data = readFileSync(path);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME_BY_EXTENSION[extname(filename)] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}