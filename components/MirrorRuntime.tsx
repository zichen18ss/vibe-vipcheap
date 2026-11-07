"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatMoney, getProduct, products } from "@/lib/catalog";
import { useApp } from "./AppProviders";

const ACTIVE_VARIANT_CLASSES = "p-4 rounded-xl border text-left transition-all relative group bg-cyber-green/10 border-cyber-green shadow-lg shadow-cyber-green/5";
const INACTIVE_VARIANT_CLASSES = "p-4 rounded-xl border text-left transition-all relative group bg-white/[0.01] border-white/5 hover:bg-white/10 hover:border-white/20";
const ACTIVE_CATEGORY_CLASSES = "px-6 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap bg-cyber-green text-cyber-bg shadow-xl shadow-cyber-green/20";
const INACTIVE_CATEGORY_CLASSES = "px-6 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap glass text-white/40 hover:text-white border border-white/5";

function currentProductSlug(pathname: string) {
  const match = pathname.match(/^\/product\/([^/]+)/);
  return match?.[1];
}

function countdownText(endTime: number) {
  const remaining = Math.max(0, endTime - Date.now());
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}天${hours}时${String(minutes).padStart(2, "0")}分`;
}

export function MirrorRuntime() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, addToCart, buyNow, openPayment, notify } = useApp();
  const selectedVariants = useRef<Record<string, number>>({});
  const quantities = useRef<Record<string, number>>({});
  const sortIndex = useRef<Record<string, number>>({});

  useEffect(() => {
    const pageSlug = currentProductSlug(pathname);
    if (pageSlug) {
      const active = document.querySelector<HTMLElement>("[data-variant-index].bg-cyber-green\\/10");
      selectedVariants.current[pageSlug] = Number(active?.dataset.variantIndex || 0);
      quantities.current[pageSlug] = 1;
      document.querySelectorAll<HTMLElement>("[data-qty-value]").forEach((node) => {
        node.textContent = "1";
      });
    }
  }, [pathname]);

  useEffect(() => {
    const updateCountdowns = () => {
      document.querySelectorAll<HTMLElement>("span").forEach((node) => {
        if (!/^\d+天\d+时\d+分$/.test(node.textContent?.trim() || "")) return;
        const scope = node.closest(".group") || node.closest(".glass") || node.closest("main");
        const directLink = scope?.querySelector<HTMLAnchorElement>('a[href^="/product/"]');
        const slug = directLink?.getAttribute("href")?.split("/").pop() || currentProductSlug(pathname);
        const product = slug ? getProduct(slug) : undefined;
        if (product) node.textContent = countdownText(product.saleEndTime);
      });
    };

    updateCountdowns();
    const timer = window.setInterval(updateCountdowns, 30000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/products") return;
    const query = new URLSearchParams(window.location.search).get("search")?.trim().toLowerCase();
    if (!query) return;
    document.querySelectorAll<HTMLElement>('a[href^="/product/"]').forEach((link) => {
      const container = link.closest<HTMLElement>(".group");
      if (!container) return;
      container.style.display = link.textContent?.toLowerCase().includes(query) ? "" : "none";
    });
  }, [pathname]);

  useEffect(() => {
    const updateVariant = (slug: string, index: number) => {
      const product = getProduct(slug);
      const variant = product?.variants[index];
      if (!product || !variant) return;
      selectedVariants.current[slug] = index;
      document.querySelectorAll<HTMLElement>("[data-variant-index]").forEach((button) => {
        button.className = Number(button.dataset.variantIndex) === index
          ? ACTIVE_VARIANT_CLASSES
          : INACTIVE_VARIANT_CLASSES;
      });
      document.querySelectorAll<HTMLElement>("[data-vip-price]").forEach((node) => {
        node.textContent = formatMoney(variant.vipPrice);
      });
      document.querySelectorAll<HTMLElement>("[data-retail-price]").forEach((node) => {
        node.textContent = `￥${formatMoney(variant.originalPrice)}`;
      });
      document.querySelectorAll<HTMLElement>("[data-qty-value]").forEach((node) => {
        node.textContent = String(quantities.current[slug] || 1);
      });
    };

    const updateQuantity = (slug: string, delta: number) => {
      const next = Math.max(1, Math.min(99, (quantities.current[slug] || 1) + delta));
      quantities.current[slug] = next;
      document.querySelectorAll<HTMLElement>("[data-qty-value]").forEach((node) => {
        node.textContent = String(next);
      });
      document.querySelectorAll<HTMLButtonElement>('[data-action="qty-decrease"]').forEach((button) => {
        button.disabled = next <= 1;
      });
      document.querySelectorAll<HTMLButtonElement>('[data-action="qty-increase"]').forEach((button) => {
        button.disabled = next >= 99;
      });
    };

    const applyCategoryFilter = (category: string) => {
      document.querySelectorAll<HTMLButtonElement>('[data-action="filter-category"]').forEach((button) => {
        button.className = button.dataset.category === category ? ACTIVE_CATEGORY_CLASSES : INACTIVE_CATEGORY_CLASSES;
      });
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/product/"]').forEach((link) => {
        const container = link.closest<HTMLElement>(".group");
        const slug = link.getAttribute("href")?.split("/").pop() || "";
        const product = getProduct(slug);
        if (container && product) {
          container.style.display = category === "All" || product.categoryLabel === category ? "" : "none";
        }
      });
    };

    const cycleSort = () => {
      const pageKey = pathname + window.location.search;
      const index = ((sortIndex.current[pageKey] ?? 0) + 1) % 3;
      sortIndex.current[pageKey] = index;
      const labels = ["最新上架", "价格从低到高", "价格从高到低"];
      const button = document.querySelector<HTMLButtonElement>('[data-action="sort-menu"]');
      const label = button?.querySelector("span");
      if (label) label.textContent = labels[index];
      const grid = document.querySelector<HTMLElement>(".grid.grid-cols-1.sm\\:grid-cols-2");
      if (!grid) return;
      const containers = Array.from(grid.children) as HTMLElement[];
      containers.sort((a, b) => {
        const price = (node: HTMLElement) => {
          const slug = node.querySelector<HTMLAnchorElement>('a[href^="/product/"]')?.getAttribute("href")?.split("/").pop() || "";
          return getProduct(slug)?.variants[0]?.vipPrice || 0;
        };
        return index === 1 ? price(a) - price(b) : index === 2 ? price(b) - price(a) : 0;
      });
      containers.forEach((node) => grid.appendChild(node));
    };

    const consumeProductSelection = (slug: string) => {
      const product = getProduct(slug);
      if (!product) return null;
      const variantIndex = selectedVariants.current[slug] ?? 0;
      const variant = product.variants[variantIndex] || product.variants[0];
      return {
        productSlug: slug,
        variantId: variant.id,
        quantity: quantities.current[slug] || 1,
        selected: true,
      };
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const actionNode = target.closest<HTMLElement>("[data-action]");
      const rawButton = target.closest("button");
      if (!actionNode && rawButton?.textContent?.trim() === "立即锁定权益") {
        router.push("/membership");
        return;
      }
      if (!actionNode) return;
      const action = actionNode.dataset.action;
      const pageSlug = currentProductSlug(pathname);

      if (action === "select-variant" && pageSlug) {
        updateVariant(pageSlug, Number(actionNode.dataset.variantIndex || 0));
      } else if (action === "qty-decrease" && pageSlug) {
        updateQuantity(pageSlug, -1);
      } else if (action === "qty-increase" && pageSlug) {
        updateQuantity(pageSlug, 1);
      } else if ((action === "add-cart" || action === "buy-now") && pageSlug) {
        const line = consumeProductSelection(pageSlug);
        if (!line) return;
        if (action === "add-cart") addToCart(line);
        else buyNow(line);
      } else if (action === "share") {
        const url = window.location.href;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(url).then(() => notify("商品链接已复制")).catch(() => notify("复制失败，请手动复制地址"));
        } else {
          notify(`商品链接：${url}`);
        }
      } else if (action === "filter-category") {
        applyCategoryFilter(actionNode.dataset.category || "All");
      } else if (action === "sort-menu") {
        cycleSort();
      } else if (action === "membership-checkout") {
        const lifetime = actionNode.dataset.plan === "lifetime";
        openPayment({
          kind: "membership",
          plan: lifetime ? "lifetime" : "annual",
          title: lifetime ? "终身会员" : "年度会员",
          subtitle: lifetime ? "终身 VIP 套餐" : "年度 VIP 套餐",
          amount: lifetime ? 34500 : 6900,
        });
      }
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [addToCart, buyNow, notify, openPayment, pathname, router, user]);

  return null;
}

