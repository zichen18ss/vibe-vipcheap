import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MirrorPage } from "@/components/MirrorPage";

const pages = {
  help: { key: "help", title: "帮助中心" },
  contact: { key: "contact", title: "联系我们" },
  faq: { key: "faq", title: "常见问题" },
  "refund-policy": { key: "refund", title: "退款政策" },
  terms: { key: "terms", title: "服务条款" },
  privacy: { key: "privacy", title: "隐私政策" },
  cookies: { key: "cookies", title: "Cookie 政策" },
} as const;

type ContentPageProps = {
  params: Promise<{ page: string }>;
};

export async function generateMetadata({ params }: ContentPageProps): Promise<Metadata> {
  const { page } = await params;
  const config = pages[page as keyof typeof pages];
  return config ? { title: config.title } : {};
}

export default async function Page({ params }: ContentPageProps) {
  const { page } = await params;
  const config = pages[page as keyof typeof pages];
  if (!config) notFound();
  return <MirrorPage pageKey={config.key} />;
}