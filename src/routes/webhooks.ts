/**
 * Salesforce B2C Commerce (SFCC) order webhooks → normalized OrderStateChanged.
 *
 * SCAPI Webhooks (or B2C Commerce Cloud realtime data exports) POST order
 * events to subscribed URLs. Authentication uses a short-lived JWT from
 * SCAPI OAuth; for v0.2.3 we use the shared-secret header
 * `X-Xpay-Webhook-Secret`. v0.3 will verify the SCAPI JWT bearer instead.
 *
 * Payload shape varies by data-export script; the bridge cartridge
 * (`int_xpay_agentic_commerce`) normalizes to:
 *   {
 *     event: "order.created" | "order.updated" | "order.fulfilled" | …,
 *     order: { order_no: "00012345", uuid: "abc-…", customer_no: "0000123" }
 *   }
 */

import { RouteTable } from "./match";
import type { RouteHandler, RouteResponse } from "./types";
import { getOrderEventEmitter, type OrderEventTopic, type OrderStateChanged } from "../events";

const EVENT_TO_TOPIC: Record<string, OrderEventTopic | undefined> = {
  "order.created": "order.created",
  "order.updated": "order.updated",
  "order.fulfilled": "order.fulfilled",
  "order.cancelled": "order.cancelled",
  "order.refunded": "order.refunded",
};

export function buildWebhookRouteTable(): RouteTable<RouteHandler> {
  const table = new RouteTable<RouteHandler>();
  table.add("POST", "/webhooks/salesforce-commerce", buildSfccWebhookRoute());
  return table;
}

export function buildSfccWebhookRoute(): RouteHandler {
  return async (req): Promise<RouteResponse> => {
    const secret = process.env.XPAY_WEBHOOK_SHARED_SECRET || "";
    if (!secret) return jsonError(503, "webhook_secret_unconfigured", "XPAY_WEBHOOK_SHARED_SECRET env required");
    if (headerOf(req.headers, "x-xpay-webhook-secret") !== secret) {
      return jsonError(401, "invalid_signature", "shared-secret mismatch");
    }

    let payload: { event?: string; order?: { order_no?: string; uuid?: string } } & Record<string, unknown>;
    try {
      payload = JSON.parse(req.body || "{}");
    } catch {
      return jsonError(400, "invalid_json", "webhook body is not valid JSON");
    }

    const mapped = payload.event ? EVENT_TO_TOPIC[payload.event] : undefined;
    if (!mapped) return { status: 204, headers: {}, body: "" };

    const orderId = payload.order?.order_no || payload.order?.uuid;
    if (!orderId) return jsonError(400, "missing_order_id", "order.order_no or order.uuid required");

    const event: OrderStateChanged = {
      source: "salesforce-commerce",
      topic: mapped,
      orderId,
      occurredAt: new Date().toISOString(),
      payload,
    };
    await getOrderEventEmitter().emit(event);
    return { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ ok: true }) };
  };
}

function headerOf(headers: Record<string, string | string[] | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function jsonError(status: number, code: string, message: string): RouteResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ error: { code, message } }),
  };
}
