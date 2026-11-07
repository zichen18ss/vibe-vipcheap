export type UserRole = "customer" | "admin";

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  points: number;
  permissions?: import("./permissions").AdminPermission[];
  isSuperAdmin?: boolean;
  createdAt: number;
};

export type CartLine = {
  productSlug: string;
  variantId: number;
  quantity: number;
  selected: boolean;
};

export type CartView = {
  line: CartLine;
  key: string;
  product: import("./catalog").Product;
  variant: import("./catalog").ProductVariant;
};

export type PaymentRequest = (
  | {
      kind: "membership";
      plan: "annual" | "lifetime";
      title: string;
      subtitle: string;
      amount: number;
    }
  | {
      kind: "cart";
      title: string;
      subtitle: string;
      amount: number;
      items: CartLine[];
    }
) & {
  resumeOrder?: Order;
};

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "completed"
  | "cancelled"
  | "refunded";

export type OrderItem = {
  id: string;
  productSlug: string;
  productName: string;
  variantId: number;
  variantName: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  image: string;
  lineTotal: number;
};

export type Order = {
  id: string;
  orderNo: string;
  kind: "cart" | "membership";
  status: OrderStatus;
  statusLabel: string;
  subtotal: number;
  couponDiscount: number;
  pointsDiscount: number;
  total: number;
  couponCode: string | null;
  pointsUsed: number;
  pointsEarned: number;
  paymentProvider: string | null;
  paymentMethod: string | null;
  paidAt: number | null;
  fulfillmentNote: string | null;
  createdAt: number;
  updatedAt: number;
  items: OrderItem[];
};

export type Coupon = {
  id: string;
  code: string;
  title: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: number;
  endsAt: number | null;
  active?: boolean;
  usedCount?: number;
  totalLimit?: number | null;
  perUserLimit?: number;
};

export type PointsLedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  orderId: string | null;
  createdAt: number;
};

export type AccountData = {
  user: User;
  orders: Order[];
  pointsLedger: PointsLedgerEntry[];
  coupons: Coupon[];
};

export type PaymentResult = {
  payment: {
    status: "pending" | "succeeded" | "failed";
    provider: "sandbox" | "stripe";
    method: string;
    redirectUrl?: string;
  };
  order?: Order;
};
