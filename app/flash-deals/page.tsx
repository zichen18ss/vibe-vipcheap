import type { Metadata } from "next";
import { MirrorPage } from "@/components/MirrorPage";

export const metadata: Metadata = { title: "限时特惠" };

export default function Page() {
  return <MirrorPage pageKey="flash" />;
}
