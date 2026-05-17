# agentic-commerce-for-salesforce-commerce

**Multi-protocol agentic-commerce layer for [Salesforce B2C Commerce Cloud](https://www.salesforce.com/products/commerce-cloud/) (formerly Demandware).** Speaks ACP, UCP, AP2; emits real-standard discovery files; signed-JWT cart-deeplinks; rail-agnostic.

Runs as a Node sidecar talking to SFCC over the OCAPI Shop API. Implements [`@xpaysh/adapter-contract`](https://www.npmjs.com/package/@xpaysh/adapter-contract) — same contract as every sibling in the family.

> v0.1 ships as a **Node sidecar** against OCAPI Shop API. v0.2 adds an SFRA (Storefront Reference Architecture) **B2C cartridge** that emits discovery files directly from the storefront and signs attribution tokens at order placement.

## What v0.1 ships

### Discovery

| Path | Standard |
|---|---|
| `GET /llms.txt` | [llmstxt.org](https://llmstxt.org) |
| `GET /.well-known/ucp` | UCP profile |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 (opt-in) |
| `GET /.well-known/agent-card.json` | A2A 1.0 (opt-in) |
| `GET /robots.txt` | RFC 9309 + AI-bot allowlist |
| `GET /api/v1/jsonld/product/:id` | schema.org JSON-LD |

### Protocols

- **UCP**: catalog search/lookup, basket CRUD, checkout handoff
- **ACP**: `checkout_sessions` create / get / update / complete
- **AP2**: structural mandate verification, mandate-bound checkout

### Cart handoff

`GET /cart/deeplink?token=<jwt>` redeems an HS256-signed JWT and lands the agent on the storefront's Cart-Show with a pre-filled SFCC basket.

## Capabilities

```
cart                ✓
checkout            ✓  (hands off to SFRA checkout)
catalogSearch       ✓
catalogLookup       ✓
order               ✓  (single-order lookup; listOrders is v0.3 — needs Data API)
inventoryRealtime   ✓
refunds             —  v0.3
disputes            —  v0.3
webhooks            —  v0.3
```

## Quickstart (Docker)

```bash
git clone https://github.com/xpaysh/agentic-commerce-for-salesforce-commerce.git
cd agentic-commerce-for-salesforce-commerce
cp .env.example .env
# Fill in XPAY_MERCHANT_SLUG, SITE_URL, XPAY_API_KEY,
# SFCC_INSTANCE, SFCC_SITE_ID, SFCC_CLIENT_ID, SFCC_CLIENT_SECRET

docker compose -f examples/docker-compose.yml up --build
```

## Manual run

```bash
npm install
cp .env.example .env       # fill in
npm run build
node --env-file=.env dist/server.js
```

## Get OCAPI credentials

1. **Account Manager → API Client → Add API Client**
   - Display name: `xpay agentic commerce`
   - Generate password (save as `SFCC_CLIENT_SECRET`)
   - Copy the **API Client ID** → `SFCC_CLIENT_ID`
   - Default scopes (Open Commerce): `SALESFORCE_COMMERCE_API:tenant_id`
2. **Business Manager → Administration → Site Development → Open Commerce API Settings → Shop → Configuration**
   - Add an entry for the client_id you just created, allowlisting the OCAPI Shop resources used by v0.1:
     ```
     /products/**
     /product_search
     /baskets
     /baskets/*/items
     /baskets/*/items/*
     /baskets/*/shipments/*/shipping_address
     /orders/*
     ```
3. **Find your instance + site id:**
   - `SFCC_INSTANCE` = e.g. `zzzz-aaaa.dx.commercecloud.salesforce.com`
   - `SFCC_SITE_ID` = e.g. `RefArch` (the channel id under Sites in Business Manager)

## v0.2 roadmap — SFRA cartridge

The Node sidecar handles agent-discovery + cart-handoff, but a native cartridge unlocks two things the sidecar can't:

- Discovery files (`/llms.txt`, JSON-LD on PDPs, agent-card.json) emitted directly by SFCC's request lifecycle so they appear under the merchant's canonical domain without a separate reverse proxy.
- Order-placement-time attribution: the cartridge hooks `dw.order.OrderMgr` to write the agent-attribution token onto the order so reporting can attribute revenue without backfill.

The cartridge will be Composer-installable via SFCC's standard cartridge upload + assignment flow.

## Architecture

This package is the eighth sibling in the family — completing every platform on the [Phase B + Phase C plan](https://github.com/xpaysh/agentic-commerce-plugin-template):

- [agentic-commerce-for-woocommerce](https://github.com/xpaysh/agentic-commerce-for-woocommerce)
- [agentic-commerce-for-commercetools](https://github.com/xpaysh/agentic-commerce-for-commercetools)
- [agentic-commerce-for-bigcommerce](https://github.com/xpaysh/agentic-commerce-for-bigcommerce)
- [agentic-commerce-for-magento](https://github.com/xpaysh/agentic-commerce-for-magento)
- [agentic-commerce-for-saleor](https://github.com/xpaysh/agentic-commerce-for-saleor)
- [agentic-commerce-for-prestashop](https://github.com/xpaysh/agentic-commerce-for-prestashop)
- [agentic-commerce-for-shopify-app](https://github.com/xpaysh/agentic-commerce-for-shopify-app)
- [agentic-commerce-for-salesforce-commerce](https://github.com/xpaysh/agentic-commerce-for-salesforce-commerce) — *this repo*

## License

Apache-2.0
