# Sur — Nano and x402 machine services

**Status (18 November 2026):** A no-cost, isolated recovery endpoint is available for **new, separately paid** Nano courier requests. The original Vercel-hosted endpoint is disabled; do not pay through it. This repository's live API and payment details are documented below, with important limits.

## Available endpoints

| Service | Endpoint | Price | Verification status |
| --- | --- | --- | --- |
| Nano mainnet signed-block courier | [Recovery API](https://api-v2.appdeploy.ai/app/wallenhof-nano-courier-recovery-canary-4nhzyy/api/courier) | 0.25 XNO per settled request; delivery is not guaranteed | Public unpaid protocol and replay safety checks passed; **first real paid recovery delivery not yet demonstrated** |
| Base USDC courier | [API](https://api-v2.appdeploy.ai/app/demand-factory-base-courier-az59go/api/courier-usdc) | 0.25 USDC | Canary; no verified paid deliveries |
| Deterministic hash | [API](https://api-v2.appdeploy.ai/app/demand-factory-base-courier-az59go/api/hash) | Historical 0.001 USDC; price discrepancy — see notice below | Canary; no verified paid deliveries |
| Canonical JSON and SHA-256 | [API](https://api-v2.appdeploy.ai/app/demand-factory-base-courier-az59go/api/canonical-json) | Historical 0.001 USDC; price discrepancy — see notice below | Canary; no verified paid deliveries |

**Price reconciliation notice (24 November 2026):** The historical listing for the hash and canonical-JSON utilities is 0.001 USDC per call, but the currently stored AppDeploy deployment snapshot `1790014228440` declares `$0.01` in its catalog, OpenAPI/llms.txt and payment-collection code. The current external payment challenge could not be independently read during this check. Do not authorize payment at a conflicting price; inspect the unpaid x402 challenge and request clarification here before proceeding. This notice does not authorize a price change or modify the API, recipient, network, or any prepaid credit. The free catalog route is `/api/catalog` (ordinary GET without a payment header).

These are **machine APIs**, not a website checkout or a request for wallet keys. The Nano price, network, payment recipient and protocol remain unchanged from the protected existing service.

## Nano courier — safe quick start

1. Make an **unpaid GET** request to the [recovery endpoint](https://api-v2.appdeploy.ai/app/wallenhof-nano-courier-recovery-canary-4nhzyy/api/courier) to inspect current service status.
2. An **unpaid POST** returns an x402 v2 `PAYMENT-REQUIRED` challenge, including the exact `nano:mainnet` payment terms. Inspect those terms in your own x402 client before deciding whether to pay.
3. If proceeding with a **new** request, create and sign the Nano `state` block **locally**, excluding proof-of-work. Supply `{"block":{...},"subtype":"send"}` or the appropriate `receive`, `open` or `change` subtype. Do **not** share any seed, private key, wallet credentials or recovery phrase.
4. A compatible x402 v2 client supplies the normal `PAYMENT-SIGNATURE` for the exact resource. Keep the returned payment and block hashes and confirm the result independently.

**Payment and delivery are distinct:** The existing implementation settles a valid x402 payment **before** attempting work generation, Nano broadcast and confirmation. A paid request can therefore end in `PAID_DELIVERY_UNRESOLVED`; it is not a per-confirmed-block guarantee. In that case, preserve the payment receipt and signed block hash and request reconciliation, **not another payment**.

**Critical safety:** Do not blindly retry a paid request. Verify whether settlement or Nano publication already occurred. The isolated recovery service has shown invalid-payment rejection and an already-confirmed block replay returning 409 with `paid:false`; a *new real paid* recovery-host delivery and concurrent valid-payment exactly-once guarantee remain unproven. The recovery endpoint rejects ambiguous Nano-RPC status instead of assuming a block was unpublished.

**Previously prepaid work must not be paid for twice.** Earlier purchaser `pursekeeper` documented two advance payments (10 and 15 XNO); the actual unused credit is still being reconciled. The recovery API does **not** yet expose authenticated prepaid redemption. Customers with prepaid orders should use the [existing public order thread](https://github.com/TheAliphant/Sur/issues/2) rather than purchasing them again.

## Base utility integrator preflight — no payment

Before integrating either utility, inspect the [free machine-readable catalog](https://api-v2.appdeploy.ai/app/demand-factory-base-courier-az59go/api/catalog). The stored deployment `1790014228440` documents SHA-256/SHA-512 hashing and recursively key-sorted compact JSON with a SHA-256 digest. The catalog is a discovery surface, not proof of paid delivery.

Both utility handlers implement an explicit `probe: true` mode that rejects payment headers before settlement. These examples request only the unpaid challenge; they do not send credentials, a wallet signature or customer data:

```sh
BASE=https://api-v2.appdeploy.ai/app/demand-factory-base-courier-az59go
curl -sS -i --max-time 15 -X POST "$BASE/api/hash" \
  -H 'Content-Type: application/json' --data '{"probe":true}'
curl -sS -i --max-time 15 -X POST "$BASE/api/canonical-json" \
  -H 'Content-Type: application/json' --data '{"probe":true}'
```

Expected from the stored source: HTTP 402 with x402 payment terms. A bare hosting-provider 402, missing terms, timeout or price mismatch is **not** a successful preflight. Inspect network, asset, exact price, resource and recipient; do not attach a payment header to a probe. The live challenge was not reachable through our read tool on 25 November 2026, so the above commands are source-checked examples, not fresh live acceptance.

For evaluating fit only, the documented request shape for hashing is `{"text":"hello","algorithm":"sha256"}` (UTF-8, up to 100,000 bytes; `sha512` also supported). Canonical JSON accepts `{"value":{"b":2,"a":1}}` (up to 100,000 serialized JSON bytes). Neither example is a purchase instruction. The price reconciliation notice above remains in force: do not authorize payment at a conflicting price.

## Verification and support

- [Public service offer, technical limitations and independent test links](https://github.com/TheAliphant/Sur/issues/5)
- [Existing paid customer's public order and service discussion](https://github.com/TheAliphant/Sur/issues/2)
- [Independent no-spend x402 contract check](https://github.com/TheAliphant/Sur/actions/runs/43642881601)
- [Independent confirmed-block replay check](https://github.com/TheAliphant/Sur/actions/runs/43664568828)

To discuss a **new paid machine request** or confirm acceptance criteria, open a public issue in this repository. Do not post secrets, invoices, sensitive information or wallet keys. The existing prepaid customer's commitments take priority over any new charging.

_Sur / Wallenhof. Public product information; no claim of new sales or restored Vercel production._
