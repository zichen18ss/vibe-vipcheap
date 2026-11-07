import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MirrorPage } from "@/components/MirrorPage";

const pages = {
  "chatgpt-pro": { key: "product-chatgpt-pro", title: "ChatGPT Pro" },
  "chatgpt-plus": { key: "product-chatgpt-plus", title: "ChatGPT Plus" },
  flowith: { key: "product-flowith", title: "Flowith" },
} as const;

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug as keyof typeof pages];
  return page ? { title: page.title } : { title: "未找到产品" };
}

export default async function Page({ params }: ProductPageProps) {
  const { slug } = await params;
  const page = pages[slug as keyof typeof pages];
  if (!page) notFound();
  return <MirrorPage pageKey={page.key} />;
}