# Agentic Commerce for Salesforce Commerce Cloud

Multi-protocol agentic-commerce layer for [Salesforce B2C Commerce Cloud](https://www.salesforce.com/products/commerce-cloud/) (formerly Demandware). Speaks **[ACP](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)**, **[UCP](https://github.com/Universal-Commerce-Protocol/ucp)**, and **[AP2](https://github.com/google-agentic-commerce/AP2)** out of the box, emits real-standard discovery files (`/llms.txt`, schema.org JSON-LD, real-AI-crawler `robots.txt`), and settles through your existing B2C Commerce payment integration — cards, [Stripe MPP](https://mpp.dev), [x402](https://x402.org), stablecoins.

> Scaffold for the [`agentic-commerce-for-*`](https://github.com/xpaysh?q=agentic-commerce-for-) family. Full implementation lands in coming weeks alongside the [plugin template](https://github.com/xpaysh/agentic-commerce-plugin-template).

## What this gives a B2C Commerce merchant

- **Agent-readable storefront** — your B2C Commerce catalog gets exposed to ChatGPT, Claude, Gemini, and Perplexity via [llms.txt](https://llmstxt.org), schema.org JSON-LD on PDPs and search-result pages, and a `robots.txt` allowlist for real AI crawlers.
- **Multi-protocol checkout endpoints** — ACP `POST /checkout_sessions` + `/delegate_payment` backed by [OCAPI](https://documentation.b2c.commercecloud.salesforce.com/DOC1/index.jsp?topic=%2Fcom.demandware.dochelp%2FOCAPI%2Fcurrent%2Fusage%2FOCAPI.html) / [SCAPI](https://developer.salesforce.com/docs/commerce/commerce-api/overview) basket and order resources; UCP REST surface with [RFC 9421](https://datatracker.ietf.org/doc/rfc9421/) signed-request verification; AP2 mandate acceptance.
- **No new processor.** Agents settle through your existing B2C Commerce payment integration (Stripe, Adyen, PayPal, CyberSource, Braintree, …). Optional MPP / x402 / stablecoin rails are configurable.
- **Cart deeplinks** — JWT-signed (commercial mode) or query-string (standalone) — pre-fill an SCAPI basket and redirect the buyer to your existing checkout.
- **Two-mode operation** — *standalone* (no xpay backend) or *commercial* (xpay backend adds catalog hosting, attribution, multi-region analytics).

## Distribution shape

Salesforce B2C Commerce uses a cartridge model — proprietary scripting layered on top of SFRA (Storefront Reference Architecture) or PWA Kit. This repo ships as:

- **B2C Commerce Cartridge** — installable cartridge added to the merchant's cartridge path; works with SFRA storefronts.
- **PWA Kit extension** — headless React adapter for stores on Salesforce's PWA Kit (which is JS-native; reuses the shared template directly).
- **LINK Marketplace listing** — Salesforce's partner-distributed extension catalog.

```
   AI Agent  ───►  Salesforce B2C Commerce store  ───►  OCAPI / SCAPI
                  (ACP / UCP / AP2 endpoints              (basket, order, catalog)
                   exposed via cartridge or PWA Kit)
                          │
                          └──►  Merchant's existing PSP
                                (Stripe, Adyen, CyberSource, MPP, x402, …)
```

## Status

- 🚧 **Scaffold** — README + LICENSE only. Highest engineering investment of the first-party set (proprietary B2C Commerce scripting). Largest per-install commercial value (enterprise buyers); slowest procurement cycles.
- Track progress and adjacent platforms in the [awesome-agentic-commerce](https://github.com/xpaysh/awesome-agentic-commerce) registry.

## See also

- [Plugin template](https://github.com/xpaysh/agentic-commerce-plugin-template) — shared TypeScript core
- [awesome-agentic-commerce](https://github.com/xpaysh/awesome-agentic-commerce) — ecosystem registry
- [Agentic Commerce for commercetools](https://github.com/xpaysh/agentic-commerce-for-commercetools) · [Agentic Commerce for BigCommerce](https://github.com/xpaysh/agentic-commerce-for-bigcommerce) — sibling scaffolds
- [ACP vs UCP vs AP2 — Technical Comparison](https://docs.xpay.sh/agentic-commerce-protocols/comparison)
- [Salesforce B2C Commerce Dev Center](https://developer.salesforce.com/developer-centers/commerce-cloud) · [LINK Marketplace](https://www.salesforce.com/products/commerce-cloud/link/)

## License

Apache-2.0.
