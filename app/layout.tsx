import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MirrorRuntime } from "@/components/MirrorRuntime";

export const metadata: Metadata = {
  title: {
    default: "VipCheap - AI会员权益折扣店",
    template: "%s | VipCheap",
  },
  description: "VipCheap 镜像复刻站：ChatGPT Plus、ChatGPT Pro、Flowith 等 AI 会员权益折扣与演示购买流程。",
  icons: { icon: "/assets/images/logo.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/vendor/site/_next/static/chunks/27888b6ffcce4db7.css" />
        <link rel="stylesheet" href="/vendor/site/_next/static/chunks/401347d96e67eacc.css" />
        <link rel="stylesheet" href="/vendor/cdn/cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" />
      </head>
      <body className="bg-soft-bg text-gray-700 min-h-screen flex flex-col">
        <AppProviders>
          <Header />
          <MirrorRuntime />
          {children}
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}
