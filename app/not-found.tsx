import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "未找到产品",
};

export default function NotFound() {
  return (
    <main className="fixed inset-0 z-[80] min-h-screen bg-[#0F1115] flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyber-green/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-md w-full text-center relative z-10">
        <div className="mb-8 relative inline-block">
          <div className="absolute inset-0 bg-cyber-green/20 blur-xl rounded-full" />
          <span className="relative text-9xl font-bold bg-gradient-to-r from-cyber-green to-cyber-cyan bg-clip-text text-transparent italic tracking-tighter">
            404
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4 tracking-wide">页面不存在</h1>
        <p className="text-gray-400 mb-8 leading-relaxed">
          您访问的页面可能已被移动、删除或从未存在。
        </p>
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyber-green to-cyber-cyan text-black font-bold rounded-xl transition-all hover:shadow-[0_0_20px_rgba(0,200,83,0.4)] hover:scale-105 active:scale-95"
          >
            <i className="fa-solid fa-home" />
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
