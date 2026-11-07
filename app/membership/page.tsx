import type { Metadata } from "next";
import { MirrorPage } from "@/components/MirrorPage";

export const metadata: Metadata = { title: "会员中心" };

export default function Page() {
  return <MirrorPage pageKey="membership" />;
}
