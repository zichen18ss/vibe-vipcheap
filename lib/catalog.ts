import productsData from "./products.json";

export type ProductStatus = "draft" | "published" | "archived";

export type ProductVariant = {
  id: number;
  sku?: string;
  name: string;
  displayName: string;
  price: number;
  vipPrice: number;
  originalPrice: number;
  stock: number;
  soldCount: number;
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  desc: string;
  category: string;
  categoryLabel: string;
  isFlashSale: boolean;
  isNew: boolean;
  saleEndTime: number;
  rating: number;
  reviewCount: number;
  stock: number;
  soldCount: number;
  image: string;
  heroImage: string;
  variants: ProductVariant[];
  status?: ProductStatus;
  sortOrder?: number;
  createdAt?: number;
  updatedAt?: number;
  publishedAt?: number | null;
};

export const products = Object.values(productsData) as Product[];
export const productBySlug = new Map(products.map((product) => [product.slug, product]));

export function getProduct(slug: string): Product | undefined {
  return productBySlug.get(slug);
}

export function getVariant(product: Product, variantId: number): ProductVariant | undefined {
  return product.variants.find((variant) => variant.id === variantId);
}

export function formatMoney(cents: number, trim = true): string {
  const amount = cents / 100;
  if (!trim) return amount.toFixed(2);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0$/, "");
}

export function primaryVariant(product: Product): ProductVariant {
  return product.variants[0];
}