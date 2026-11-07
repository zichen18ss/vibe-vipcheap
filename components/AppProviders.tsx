"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getProduct, getVariant } from "@/lib/catalog";
import { errorMessage, requestJson } from "@/lib/client-api";
import type { CartLine, CartView, Order, PaymentRequest, User } from "@/lib/types";
import { AuthModal } from "@/components/AuthModal";
import { PaymentModal } from "@/components/PaymentModal";
import { Toast } from "@/components/Toast";

type AuthMode = "login" | "register";
type PendingIntent =
  | { kind: "add"; line: CartLine }
  | { kind: "buy"; line: CartLine }
  | null;

type AppContextValue = {
  user: User | null;
  ready: boolean;
  cart: CartLine[];
  cartViews: CartView[];
  cartCount: number;
  authOpen: boolean;
  authMode: AuthMode;
  paymentRequest: PaymentRequest | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  login: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  addToCart: (line: CartLine) => Promise<void>;
  buyNow: (line: CartLine) => Promise<void>;
  updateQuantity: (key: string, quantity: number) => void;
  toggleSelected: (key: string) => void;
  removeLine: (key: string) => void;
  checkoutCart: () => void;
  openPayment: (request: PaymentRequest) => void;
  openOrderPayment: (order: Order) => void;
  closePayment: () => void;
  refreshUserAndCart: () => Promise<void>;
  completePayment: (order?: Order) => void;
  notify: (message: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function lineKey(line: CartLine) {
  return `${line.productSlug}:${line.variantId}`;
}

function mergeLine(lines: CartLine[], line: CartLine): CartLine[] {
  const index = lines.findIndex((entry) => lineKey(entry) === lineKey(line));
  if (index < 0) return [...lines, { ...line, selected: true }];
  return lines.map((entry, entryIndex) =>
    entryIndex === index
      ? { ...entry, quantity: Math.min(99, entry.quantity + line.quantity), selected: true }
      : entry,
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pendingIntent = useRef<PendingIntent>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartRef = useRef<CartLine[]>([]);
  const cartQueue = useRef<Promise<void>>(Promise.resolve());

  const applyCart = useCallback((items: CartLine[]) => {
    cartRef.current = items;
    setCart(items);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const fetchCart = useCallback(async (): Promise<CartLine[]> => {
    const data = await requestJson<{ items: CartLine[] }>("/api/cart");
    applyCart(data.items);
    return data.items;
  }, [applyCart]);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const data = await requestJson<{ user: User | null }>("/api/auth/me");
    setUser(data.user);
    if (!data.user) applyCart([]);
    return data.user;
  }, [applyCart]);

  const saveCart = useCallback((items: CartLine[]): Promise<void> => {
    const operation = cartQueue.current.then(async () => {
      const data = await requestJson<{ items: CartLine[] }>("/api/cart", {
        method: "PUT",
        body: { items },
      });
      if (JSON.stringify(cartRef.current) === JSON.stringify(items)) applyCart(data.items);
    });
    cartQueue.current = operation.catch(() => undefined);
    return operation.catch(async (error) => {
      notify(errorMessage(error));
      try { await fetchCart(); } catch { /* 会话失效时由页面自行提示 */ }
      throw error;
    });
  }, [applyCart, fetchCart, notify]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await refreshUser();
        if (active && current) await fetchCart();
      } catch {
        if (active) applyCart([]);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [applyCart, fetchCart, refreshUser]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const openAuth = useCallback((mode: AuthMode = "login") => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    pendingIntent.current = null;
  }, []);

  const buildPayment = useCallback((line: CartLine): PaymentRequest | null => {
    const product = getProduct(line.productSlug);
    if (!product) return null;
    const variant = getVariant(product, line.variantId);
    if (!variant) return null;
    return {
      kind: "cart",
      title: product.name,
      subtitle: `${variant.displayName} × ${line.quantity}`,
      amount: variant.vipPrice * line.quantity,
      items: [line],
    };
  }, []);

  const login = useCallback(async (email: string, password: string, name?: string) => {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("请输入有效邮箱");
    if (!name && password.length < 1) throw new Error("请输入密码");
    if (name && password.length < 8) throw new Error("注册密码至少需要 8 位");

    const endpoint = name === undefined ? "/api/auth/login" : "/api/auth/register";
    const data = await requestJson<{ user: User }>(endpoint, {
      method: "POST",
      body: name === undefined
        ? { email: normalized, password }
        : { email: normalized, password, name: name.trim() },
    });
    setUser(data.user);
    const existingCart = await fetchCart();
    setAuthOpen(false);

    const intent = pendingIntent.current;
    pendingIntent.current = null;
    if (intent?.kind === "add") {
      const next = mergeLine(existingCart, intent.line);
      applyCart(next);
      try {
        await saveCart(next);
        notify("登录成功，商品已保存到服务端购物车");
      } catch { /* saveCart 已显示错误 */ }
    } else if (intent?.kind === "buy") {
      const request = buildPayment(intent.line);
      if (request) setPaymentRequest(request);
      notify("登录成功，请确认订单");
    } else {
      notify(name === undefined ? "登录成功" : "注册成功");
    }
  }, [applyCart, buildPayment, fetchCart, notify, saveCart]);

  const logout = useCallback(async () => {
    try {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST", body: {} });
    } finally {
      setUser(null);
      applyCart([]);
      setAuthOpen(false);
      notify("已退出登录");
    }
  }, [applyCart, notify]);

  const addToCart = useCallback(async (line: CartLine) => {
    if (!user) {
      pendingIntent.current = { kind: "add", line };
      openAuth("login");
      notify("请先登录后继续");
      return;
    }
    const next = mergeLine(cartRef.current, line);
    applyCart(next);
    try {
      await saveCart(next);
      notify("已加入购物车并同步到账号");
    } catch { /* saveCart 已显示错误 */ }
  }, [applyCart, notify, openAuth, saveCart, user]);

  const buyNow = useCallback(async (line: CartLine) => {
    if (!user) {
      pendingIntent.current = { kind: "buy", line };
      openAuth("login");
      notify("请先登录后继续");
      return;
    }
    const request = buildPayment(line);
    if (request) setPaymentRequest(request);
  }, [buildPayment, notify, openAuth, user]);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    const next = cartRef.current.map((line) =>
      lineKey(line) === key ? { ...line, quantity: Math.max(1, Math.min(99, quantity)) } : line,
    );
    applyCart(next);
    void saveCart(next).catch(() => undefined);
  }, [applyCart, saveCart]);

  const toggleSelected = useCallback((key: string) => {
    const next = cartRef.current.map((line) =>
      lineKey(line) === key ? { ...line, selected: !line.selected } : line,
    );
    applyCart(next);
    void saveCart(next).catch(() => undefined);
  }, [applyCart, saveCart]);

  const removeLine = useCallback((key: string) => {
    const next = cartRef.current.filter((line) => lineKey(line) !== key);
    applyCart(next);
    void saveCart(next).catch(() => undefined);
  }, [applyCart, saveCart]);

  const cartViews = useMemo(() => cart.flatMap((line) => {
    const product = getProduct(line.productSlug);
    if (!product) return [];
    const variant = getVariant(product, line.variantId);
    if (!variant) return [];
    return [{ line, key: lineKey(line), product, variant }];
  }), [cart]);

  const checkoutCart = useCallback(() => {
    if (!user) {
      openAuth("login");
      notify("请先登录后结算");
      return;
    }
    const selected = cartViews.filter((item) => item.line.selected);
    if (!selected.length) {
      notify("请先选择要结算的商品");
      return;
    }
    setPaymentRequest({
      kind: "cart",
      title: "购物车结算",
      subtitle: `已选择 ${selected.length} 件商品`,
      amount: selected.reduce((sum, item) => sum + item.variant.vipPrice * item.line.quantity, 0),
      items: selected.map((item) => item.line),
    });
  }, [cartViews, notify, openAuth, user]);

  const openOrderPayment = useCallback((order: Order) => {
    if (order.kind === "membership") {
      setPaymentRequest({
        kind: "membership",
        plan: order.items[0]?.productSlug === "membership-lifetime" ? "lifetime" : "annual",
        title: order.items[0]?.productName || "会员订单",
        subtitle: `订单 ${order.orderNo} · 继续支付`,
        amount: order.total,
        resumeOrder: order,
      });
      return;
    }
    setPaymentRequest({
      kind: "cart",
      title: "订单继续支付",
      subtitle: `订单 ${order.orderNo}`,
      amount: order.total,
      items: order.items.map((item) => ({
        productSlug: item.productSlug,
        variantId: item.variantId,
        quantity: item.quantity,
        selected: true,
      })),
      resumeOrder: order,
    });
  }, []);

  const refreshUserAndCart = useCallback(async () => {
    await refreshUser();
    await fetchCart();
  }, [fetchCart, refreshUser]);

  const completePayment = useCallback((order?: Order) => {
    setPaymentRequest(null);
    if (order) router.push(`/orders/${order.orderNo}`);
  }, [router]);

  const value = useMemo<AppContextValue>(() => ({
    user,
    ready,
    cart,
    cartViews,
    cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    authOpen,
    authMode,
    paymentRequest,
    openAuth,
    closeAuth,
    login,
    logout,
    addToCart,
    buyNow,
    updateQuantity,
    toggleSelected,
    removeLine,
    checkoutCart,
    openPayment: setPaymentRequest,
    openOrderPayment,
    closePayment: () => setPaymentRequest(null),
    refreshUserAndCart,
    completePayment,
    notify,
  }), [
    addToCart, authMode, authOpen, buyNow, cart, cartViews, checkoutCart,
    closeAuth, completePayment, login, logout, notify, openAuth, openOrderPayment, paymentRequest,
    ready, refreshUserAndCart, removeLine, toggleSelected, updateQuantity, user,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <AuthModal />
      <PaymentModal />
      <Toast message={toast} />
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProviders");
  return context;
}
