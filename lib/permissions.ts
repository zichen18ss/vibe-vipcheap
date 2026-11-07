export const ADMIN_PERMISSIONS = [
  "admin.read",
  "product.read",
  "product.write",
  "product.publish",
  "inventory.write",
  "order.read",
  "order.write",
  "coupon.read",
  "coupon.write",
  "user.read",
  "user.write",
  "admin.write",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  "admin.read": "后台概览",
  "product.read": "查看商品",
  "product.write": "编辑商品",
  "product.publish": "上架/下架",
  "inventory.write": "调整库存",
  "order.read": "查看订单",
  "order.write": "处理订单",
  "coupon.read": "查看优惠券",
  "coupon.write": "管理优惠券",
  "user.read": "查看用户",
  "user.write": "管理用户",
  "admin.write": "分配权限",
};

export const FULL_ADMIN_PERMISSIONS: AdminPermission[] = [...ADMIN_PERMISSIONS];

export const PRODUCT_OPERATOR_PERMISSIONS: AdminPermission[] = [
  "admin.read",
  "product.read",
  "product.write",
  "product.publish",
  "inventory.write",
];

export const ORDER_SUPPORT_PERMISSIONS: AdminPermission[] = [
  "admin.read",
  "order.read",
  "order.write",
  "coupon.read",
  "user.read",
];

export function normalizePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is AdminPermission =>
    typeof entry === "string" && (ADMIN_PERMISSIONS as readonly string[]).includes(entry),
  ))];
}