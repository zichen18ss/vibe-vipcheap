import type { Metadata } from "next";
import { AccountPage } from "@/components/AccountPage";

export const metadata: Metadata = { title: "我的账户" };

export default function Page() {
  return <AccountPage />;
}
