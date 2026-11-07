import type { Metadata } from "next";
import { MirrorPage } from "@/components/MirrorPage";

export const metadata: Metadata = { title: "新品上架" };

export default function Page() {
  return <MirrorPage pageKey="new" />;
}
