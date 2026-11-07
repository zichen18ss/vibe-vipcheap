import Link from "next/link";
import { Mail } from "lucide-react";

const groups = [
  {
    title: "购物",
    links: [["/flash-deals", "限时特惠"], ["/new-arrivals", "新品上架"], ["/products", "全部产品"], ["/membership", "会员服务"]],
  },
  {
    title: "支持",
    links: [["/help", "帮助中心"], ["/contact", "联系我们"], ["/faq", "常见问题"], ["/refund-policy", "退款政策"]],
  },
  {
    title: "法律",
    links: [["/terms", "服务条款"], ["/privacy", "隐私政策"], ["/cookies", "Cookie 政策"]],
  },
] as const;

export function Footer() {
  return (
    <footer className="relative mt-20 border-t border-white/5 bg-cyber-bg/50 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-6xl">
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-y-10 gap-x-2 md:gap-12">
          <div className="col-span-3 lg:col-span-2 space-y-6 flex flex-col items-center lg:items-start text-center lg:text-left">
            <Link className="flex items-center gap-2 group" href="/">
              <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center flex-shrink-0 bg-white/5">
                <img alt="VipCheap Logo" className="w-6 h-6 object-contain" src="/assets/images/logo.png" />
              </div>
              <span className="text-2xl font-black tracking-tighter text-gradient">VipCheap</span>
            </Link>
            <p className="text-white/40 text-sm leading-relaxed max-w-sm font-medium">
              VipCheap - 首个 AI 会员权益折扣店，汇聚 ChatGPT Plus、Claude Pro、Gemini 等热门AI工具官方直充，低至5折，安全靠谱，让AI创作更省钱。
            </p>
          </div>
          {groups.map((group) => (
            <div key={group.title} className="space-y-4 md:space-y-6 flex flex-col items-center lg:items-start text-center lg:text-left">
              <h4 className="text-xs font-bold uppercase tracking-widest text-white/20">{group.title}</h4>
              <ul className="space-y-3 md:space-y-4 w-full">
                {group.links.map(([href, label]) => (
                  <li key={href}>
                    <Link className="text-sm text-white/60 hover:text-cyber-green transition-colors font-medium block w-full lg:w-fit" href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 md:mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-xs text-white/20 font-medium text-center md:text-left order-2 md:order-1">© 2026 VipCheap. 保留所有权利。</p>
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 order-1 md:order-2">
            <div className="flex items-center gap-2 text-white/20">
              <Link className="text-xs font-medium hover:text-white transition-colors" href="/privacy">隐私政策</Link>
              <Link className="text-xs font-medium hover:text-white transition-colors" href="/terms">服务条款</Link>
            </div>
            <div className="flex items-center gap-2 text-white/20">
              <Mail className="w-4 h-4" />
              <span className="text-xs font-medium">support@vipcheap.com</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
