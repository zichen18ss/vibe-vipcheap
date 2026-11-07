import type { Metadata } from "next";
import { OrderDetailPage } from "@/components/OrderDetailPage";

export const metadata: Metadata = { title: "订单详情" };

export default async function Page({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  return <OrderDetailPage orderNo={orderNo} />;
}