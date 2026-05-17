/**
 * SfccAdapter — implements @xpaysh/adapter-contract's PlatformAdapter
 * against the Salesforce Commerce Cloud B2C OCAPI Shop API.
 *
 * SFCC quirks worth knowing:
 *   - Shop API URL pattern:
 *       https://<instance>/s/<siteId>/dw/shop/<version>/<resource>?client_id=<id>
 *   - Auth: OAuth client_credentials via Account Manager; access token
 *     refreshed every ~30 min.
 *   - Carts: SFCC calls them *baskets*. Baskets become orders via
 *     POST /orders with `basket_id` after the buyer's payment instrument
 *     is attached. v0.1 defers payment to the storefront's SFRA flow.
 *   - Money: numeric values with currency on the containing object.
 *   - OCAPI client_id allowlist must be configured in Business Manager →
 *     Open Commerce API Settings → Shop (JSON) before the endpoints are
 *     callable.
 *
 * v0.1 ships as a Node sidecar. v0.2 will add a B2C cartridge (SFRA)
 * that emits discovery files directly from the storefront and signs
 * attribution tokens at order placement.
 */

import type {
  PlatformAdapter,
  AdapterCapabilities,
  Product,
  ProductQuery,
  Paginated,
  ProductId,
  CartId,
  Cart,
  CreateCartInput,
  CartMutation,
  CompleteCheckoutInput,
  Order,
  OrderId,
  OrderQuery,
  RefundResult,
  DisputeHandle,
} from "@xpaysh/adapter-contract";

import { SfccClient, SfccError } from "./sfcc-client";
import {
  mapProduct,
  mapSearchHit,
  mapBasket,
  mapOrder,
  contractAddressToSfcc,
  type OcapiProduct,
  type OcapiProductSearch,
  type OcapiBasket,
  type OcapiOrder,
} from "./mappers";

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented in v0.1`);
    this.name = "NotImplementedError";
  }
}

export interface SfccAdapterOptions {
  sfcc: SfccClient;
  siteUrl: string;
  defaultCurrency?: string;
}

export class SfccAdapter implements PlatformAdapter {
  readonly platformName = "salesforce-commerce";

  readonly capabilities: AdapterCapabilities = {
    cart: true,
    checkout: true,
    catalogSearch: true,
    catalogLookup: true,
    order: true,
    refunds: false, // v0.3
    disputes: false, // v0.3
    inventoryRealtime: true,
    webhooks: false, // v0.3 (SFCC has Salesforce CDP / Webhooks via custom hooks)
    extras: {},
  };

  private sf: SfccClient;
  private siteUrl: string;
  private defaultCurrency: string;

  constructor(opts: SfccAdapterOptions) {
    this.sf = opts.sfcc;
    this.siteUrl = opts.siteUrl.endsWith("/") ? opts.siteUrl : opts.siteUrl + "/";
    this.defaultCurrency = opts.defaultCurrency || "USD";
  }

  // -- Catalog -------------------------------------------------------------

  async listProducts(query: ProductQuery): Promise<Paginated<Product>> {
    const params = new URLSearchParams();
    const count = Math.min(query.limit ?? 24, 200);
    const start = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;
    params.set("count", String(count));
    params.set("start", String(start));
    if (query.q) params.set("q", query.q);
    if (query.category) params.set("refine_1", `cgid=${query.category}`);
    if (query.sort === "price_asc") params.set("sort", "price-low-to-high");
    else if (query.sort === "price_desc") params.set("sort", "price-high-to-low");
    else if (query.sort === "newest") params.set("sort", "newest");

    const data = await this.sf.fetchJson<OcapiProductSearch>(
      `/product_search?${params.toString()}`,
    );
    const items = (data.hits ?? []).map((h) => mapSearchHit(h, this.siteUrl));
    const next = start + count < data.total ? String(start + count) : null;
    return { items, nextCursor: next, total: data.total };
  }

  async getProduct(id: ProductId): Promise<Product | null> {
    try {
      const data = await this.sf.fetchJson<OcapiProduct>(
        `/products/${encodeURIComponent(id)}?expand=availability,images,prices,variations`,
      );
      return mapProduct(data, this.siteUrl);
    } catch (err) {
      if (err instanceof SfccError && err.status === 404) return null;
      throw err;
    }
  }

  // -- Cart (Basket) -------------------------------------------------------

  async createCart(input: CreateCartInput): Promise<Cart> {
    // 1. Create empty basket.
    const basket = await this.sf.fetchJson<OcapiBasket>(`/baskets`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!basket.basket_id) throw new Error("createCart: SFCC returned no basket_id");
    // 2. Add product items.
    if (input.items.length > 0) {
      const body = input.items.map((it) => ({
        product_id: it.sku,
        quantity: it.quantity,
      }));
      await this.sf.fetchJson<OcapiBasket>(`/baskets/${basket.basket_id}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    return this.fetchBasket(basket.basket_id);
  }

  async getCart(id: CartId): Promise<Cart | null> {
    try {
      return await this.fetchBasket(id);
    } catch (err) {
      if (err instanceof SfccError && err.status === 404) return null;
      throw err;
    }
  }

  async updateCart(id: CartId, mutation: CartMutation): Promise<Cart> {
    const current = await this.sf.fetchJson<OcapiBasket>(`/baskets/${id}`);
    const existing = new Map<string, { itemId: string; quantity: number }>();
    for (const pi of current.product_items ?? []) {
      existing.set(pi.product_id, { itemId: pi.item_id, quantity: pi.quantity });
    }

    if (Array.isArray(mutation.setItems)) {
      const target = new Map(mutation.setItems.map((it) => [it.sku, it]));
      // Remove items not in target.
      for (const [sku, ex] of existing.entries()) {
        if (!target.has(sku)) {
          await this.sf.fetchJson(`/baskets/${id}/items/${ex.itemId}`, { method: "DELETE" });
        }
      }
      // Add new + update existing.
      const toAdd: Array<{ product_id: string; quantity: number }> = [];
      for (const [sku, t] of target.entries()) {
        const ex = existing.get(sku);
        if (!ex) {
          toAdd.push({ product_id: sku, quantity: t.quantity });
        } else if (ex.quantity !== t.quantity) {
          await this.sf.fetchJson(`/baskets/${id}/items/${ex.itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ quantity: t.quantity }),
          });
        }
      }
      if (toAdd.length > 0) {
        await this.sf.fetchJson(`/baskets/${id}/items`, {
          method: "POST",
          body: JSON.stringify(toAdd),
        });
      }
    }

    if (Array.isArray(mutation.removeSkus)) {
      for (const sku of mutation.removeSkus) {
        const ex = existing.get(sku);
        if (ex) {
          await this.sf.fetchJson(`/baskets/${id}/items/${ex.itemId}`, { method: "DELETE" });
        }
      }
    }

    if (mutation.shippingAddress) {
      try {
        await this.sf.fetchJson(`/baskets/${id}/shipments/me/shipping_address`, {
          method: "PUT",
          body: JSON.stringify(contractAddressToSfcc(mutation.shippingAddress)),
        });
      } catch {
        // Non-fatal — storefront checkout can collect.
      }
    }

    return this.fetchBasket(id);
  }

  // -- Checkout / Order ----------------------------------------------------

  async completeCheckout(input: CompleteCheckoutInput): Promise<Order> {
    // v0.1 defers payment to the storefront's SFRA checkout. We surface
    // a pending Order whose orderUrl points at the storefront cart so the
    // existing payment flow completes the transaction.
    const orderUrl = `${this.siteUrl}on/demandware.store/Sites-${this.sf.siteId}-Site/default/Cart-Show?basket_id=${encodeURIComponent(input.cartId)}`;
    return {
      id: `pending:${input.cartId}`,
      cartId: input.cartId,
      status: "created",
      items: [],
      subtotal: { amount: 0, currency: this.defaultCurrency },
      total: { amount: 0, currency: this.defaultCurrency },
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? input.shippingAddress,
      createdAt: new Date().toISOString(),
      meta: { storefront_checkout_url: orderUrl, sfcc_basket_id: input.cartId },
    };
  }

  async getOrder(id: OrderId): Promise<Order | null> {
    try {
      const data = await this.sf.fetchJson<OcapiOrder>(
        `/orders/${encodeURIComponent(id)}`,
      );
      return mapOrder(data);
    } catch (err) {
      if (err instanceof SfccError && err.status === 404) return null;
      throw err;
    }
  }

  async listOrders(query: OrderQuery): Promise<Paginated<Order>> {
    // OCAPI's order search lives on the Data API (admin), not Shop API.
    // v0.1 sidecar only has Shop API auth; expose a basic single-order
    // lookup through getOrder and surface an empty list for listOrders.
    // v0.3 will add Data API client_id + listOrders against /sites/<id>/orders.
    void query;
    return { items: [], nextCursor: null, total: 0 };
  }

  async refundOrder(): Promise<RefundResult> {
    throw new NotImplementedError("refundOrder");
  }

  async openDispute(): Promise<DisputeHandle> {
    throw new NotImplementedError("openDispute");
  }

  // -- Internals -----------------------------------------------------------

  private async fetchBasket(basketId: string): Promise<Cart> {
    const b = await this.sf.fetchJson<OcapiBasket>(`/baskets/${encodeURIComponent(basketId)}`);
    return mapBasket(b);
  }
}
