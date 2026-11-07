import type { Metadata } from "next";
import { AdminPage } from "@/components/AdminPage";

export const metadata: Metadata = { title: "管理后台" };

export default function Page() {
  return <AdminPage />;
}