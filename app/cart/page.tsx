import type { Metadata } from "next";
import { CartPage } from "@/components/CartPage";

export const metadata: Metadata = { title: "购物车" };

export default function Page() {
  return <CartPage />;
}
