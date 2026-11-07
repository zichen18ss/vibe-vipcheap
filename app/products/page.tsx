import type { Metadata } from "next";
import { MirrorPage } from "@/components/MirrorPage";

export const metadata: Metadata = { title: "全部产品" };

export default function Page() {
  return <MirrorPage pageKey="products" />;
}
