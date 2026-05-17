/**
 * OCAPI Shop API shapes → adapter-contract value types.
 *
 * SFCC money: numeric values with a separate `currency` field on the
 * containing object. Mappers convert to integer minor units.
 */

import type {
  Address,
  Cart,
  Image,
  LineItem,
  Money,
  Order,
  OrderStatus,
  Product,
  ProductVariant,
} from "@xpaysh/adapter-contract";

// --- OCAPI wire shapes (subset) ---------------------------------------

export interface OcapiImage {
  link?: string;
  alt?: string;
  title?: string;
}
export interface OcapiVariation {
  product_id?: string;
  variation_values?: Record<string, string>;
  orderable?: boolean;
  price?: number;
}
export interface OcapiProduct {
  id: string;
  name?: string;
  short_description?: string;
  long_description?: string;
  brand?: string;
  price?: number;
  currency?: string;
  primary_category_id?: string;
  image_groups?: Array<{ view_type?: string; images?: OcapiImage[] }>;
  variants?: OcapiVariation[];
  master?: { master_id?: string; orderable?: boolean };
  inventory?: { ats?: number; backorderable?: boolean; in_stock?: boolean; stock_level?: number };
  page_url?: string;
  c?: Record<string, unknown>;
}
export interface OcapiProductSearchHit {
  product_id: string;
  product_name?: string;
  price?: number;
  currency?: string;
  image?: OcapiImage;
  link?: string;
  represented_product?: { id?: string };
}
export interface OcapiProductSearch {
  count: number;
  hits?: OcapiProductSearchHit[];
  start: number;
  total: number;
  next?: string;
}

export interface OcapiBasketItem {
  item_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  price?: number;
  base_price?: number;
  c_price_after_item_discount?: number;
}
export interface OcapiBasket {
  basket_id: string;
  customer_info?: { email?: string };
  product_items?: OcapiBasketItem[];
  product_sub_total?: number;
  order_total?: number;
  currency?: string;
  last_modified?: string;
  shipments?: Array<{
    shipping_address?: OcapiAddress;
    shipping_total?: number;
  }>;
  billing_address?: OcapiAddress;
}
export interface OcapiAddress {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_code?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  title?: string;
}

export interface OcapiOrderItem {
  item_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  price?: number;
  base_price?: number;
}
export interface OcapiOrder {
  order_no: string;
  creation_date?: string;
  last_modified?: string;
  status?: string;
  confirmation_status?: string;
  payment_status?: string;
  shipping_status?: string;
  customer_info?: { email?: string };
  product_items?: OcapiOrderItem[];
  product_sub_total?: number;
  order_total?: number;
  currency?: string;
  shipments?: Array<{ shipping_address?: OcapiAddress; shipping_total?: number }>;
  billing_address?: OcapiAddress;
}

// --- Money helper -----------------------------------------------------

export function toMoney(amount: number | undefined | null, currency = "USD"): Money {
  if (amount === undefined || amount === null) return { amount: 0, currency };
  const n = Number.isFinite(amount) ? Number(amount) : 0;
  return { amount: Math.round(n * 100), currency: currency.toUpperCase() };
}

// --- Product ----------------------------------------------------------

export function mapProduct(p: OcapiProduct, siteUrl: string): Product {
  const currency = p.currency || "USD";
  const inStock = p.inventory?.in_stock ?? (p.inventory?.stock_level ?? 1) > 0;
  const inv = p.inventory?.ats ?? p.inventory?.stock_level ?? null;
  const price = toMoney(p.price, currency);
  const variants: ProductVariant[] = (p.variants ?? []).map((v) => ({
    id: v.product_id ?? p.id,
    sku: v.product_id ?? p.id,
    price: typeof v.price === "number" ? toMoney(v.price, currency) : price,
    inStock: v.orderable ?? inStock,
    inventory: null,
    attributes: v.variation_values,
  }));
  if (variants.length === 0) {
    variants.push({ id: p.id, sku: p.id, price, inStock, inventory: inv });
  }
  const url = p.page_url || joinUrl(siteUrl, `${p.id}.html`);
  return {
    id: p.id,
    sku: p.id,
    name: p.name ?? p.id,
    description: stripHtml(p.long_description || p.short_description),
    price,
    brand: p.brand,
    url,
    images: mapImages(p),
    variants,
    categories: p.primary_category_id ? [p.primary_category_id] : undefined,
  };
}

export function mapSearchHit(h: OcapiProductSearchHit, siteUrl: string): Product {
  const currency = h.currency || "USD";
  const price = toMoney(h.price, currency);
  return {
    id: h.product_id,
    sku: h.product_id,
    name: h.product_name ?? h.product_id,
    price,
    url: h.link || joinUrl(siteUrl, `${h.product_id}.html`),
    images: h.image?.link ? [{ url: h.image.link, alt: h.image.alt }] : [],
    variants: [
      {
        id: h.product_id,
        sku: h.product_id,
        price,
        inStock: true,
        inventory: null,
      },
    ],
  };
}

function mapImages(p: OcapiProduct): Image[] {
  const groups = p.image_groups ?? [];
  // Prefer 'large' view-type, fall back to first group.
  const preferred = groups.find((g) => g.view_type === "large") ?? groups[0];
  if (!preferred?.images) return [];
  return preferred.images
    .filter((i) => Boolean(i.link))
    .map<Image>((i) => ({ url: i.link as string, alt: i.alt }));
}

function stripHtml(s?: string): string | undefined {
  if (!s) return undefined;
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || undefined;
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base : base + "/";
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}${p}`;
}

// --- Cart (Basket) ----------------------------------------------------

export function mapBasket(b: OcapiBasket): Cart {
  const currency = b.currency || "USD";
  const items: LineItem[] = (b.product_items ?? []).map((pi) => {
    const unit = toMoney(pi.base_price ?? pi.price ?? 0, currency);
    return {
      id: pi.item_id,
      productId: pi.product_id,
      sku: pi.product_id,
      name: pi.product_name ?? pi.product_id,
      quantity: pi.quantity,
      unitPrice: unit,
      lineTotal: toMoney(pi.price ?? (pi.base_price ?? 0) * pi.quantity, currency),
    };
  });
  const firstShipment = b.shipments?.[0];
  return {
    id: b.basket_id,
    items,
    subtotal: toMoney(b.product_sub_total, currency),
    total: toMoney(b.order_total, currency),
    shipping: firstShipment?.shipping_total !== undefined ? toMoney(firstShipment.shipping_total, currency) : null,
    shippingAddress: firstShipment?.shipping_address ? mapAddress(firstShipment.shipping_address) : undefined,
    billingAddress: b.billing_address ? mapAddress(b.billing_address) : undefined,
    updatedAt: b.last_modified,
    meta: {
      sfcc_basket_id: b.basket_id,
      sfcc_currency: currency,
      customer_email: b.customer_info?.email,
    },
  };
}

// --- Order ------------------------------------------------------------

export function mapOrder(o: OcapiOrder): Order {
  const currency = o.currency || "USD";
  const items: LineItem[] = (o.product_items ?? []).map((pi) => {
    const unit = toMoney(pi.base_price ?? pi.price ?? 0, currency);
    return {
      id: pi.item_id,
      productId: pi.product_id,
      sku: pi.product_id,
      name: pi.product_name ?? pi.product_id,
      quantity: pi.quantity,
      unitPrice: unit,
      lineTotal: toMoney(pi.price ?? (pi.base_price ?? 0) * pi.quantity, currency),
    };
  });
  const firstShipment = o.shipments?.[0];
  return {
    id: o.order_no,
    status: mapStatus(o),
    items,
    subtotal: toMoney(o.product_sub_total, currency),
    total: toMoney(o.order_total, currency),
    shippingAddress: firstShipment?.shipping_address ? mapAddress(firstShipment.shipping_address) : undefined,
    billingAddress: o.billing_address ? mapAddress(o.billing_address) : undefined,
    createdAt: o.creation_date ?? new Date().toISOString(),
    updatedAt: o.last_modified,
    paymentStatus: o.payment_status,
    meta: {
      sfcc_order_no: o.order_no,
      sfcc_status: o.status,
      sfcc_confirmation_status: o.confirmation_status,
      sfcc_payment_status: o.payment_status,
      sfcc_shipping_status: o.shipping_status,
      customer_email: o.customer_info?.email,
    },
  };
}

function mapStatus(o: OcapiOrder): OrderStatus {
  const s = (o.status || "").toLowerCase();
  const ship = (o.shipping_status || "").toLowerCase();
  const pay = (o.payment_status || "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "failed") return "cancelled";
  if (ship === "shipped") return "shipped";
  if (ship === "part_shipped") return "processing";
  if (pay === "paid") return "confirmed";
  if (s === "completed") return "fulfilled";
  return "created";
}

function mapAddress(a: OcapiAddress): Address | undefined {
  const line1 = a.address1;
  const city = a.city;
  const postalCode = a.postal_code;
  const country = a.country_code;
  if (!line1 || !city || !postalCode || !country) return undefined;
  const name = a.full_name || [a.first_name, a.last_name].filter(Boolean).join(" ").trim() || undefined;
  return {
    name,
    company: a.company_name,
    line1,
    line2: a.address2,
    city,
    region: a.state_code,
    postalCode,
    country,
    phone: a.phone,
  };
}

export function contractAddressToSfcc(addr: Address): OcapiAddress {
  const parts = (addr.name ?? "").trim().split(/\s+/);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || parts[0] || "",
    full_name: addr.name,
    company_name: addr.company,
    address1: addr.line1,
    address2: addr.line2,
    city: addr.city,
    state_code: addr.region,
    postal_code: addr.postalCode,
    country_code: addr.country,
    phone: addr.phone,
  };
}
