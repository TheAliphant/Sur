# Wallenhof Nano Courier — x402 seller

Program-callable, non-custodial courier for a pre-signed Nano state block.

## Live contract

- `GET /api/courier` returns service metadata without charge.
- `POST /api/courier` without payment returns HTTP 402.
- Payment scheme: x402 v2 `exact` on `nano:mainnet`.
- Price: `0.25 XNO` (`250000000000000000000000000000` raw).
- Payment address: `nano_1bfapscrwk7t66faz9emcqo318698d4yc9n7p8rh8gjuttg8ehgajgzw4bk1`.
- Paid input: `{ "block": { ...signed Nano state block without work... }, "subtype": "send|receive|open|change" }`.

The service verifies the block fields and Ed25519-Blake2b signature, checks for an existing block before mutation, obtains and validates Nano work, broadcasts exactly once, and polls independent RPCs for confirmation. It returns the computed hash, work, named work/broadcast/confirmation sources, process response, confirmation evidence, and timestamps.

It never receives a seed or private key. The x402 payment is settled by the public, non-custodial facilitator at `facilitator.pursekeeper.dev`; the payment block sends XNO directly to the seller address.

## Buyer flow

1. Probe the POST endpoint and read the base64 JSON `PAYMENT-REQUIRED` header.
2. Select the `exact` / `nano:mainnet` requirement.
3. Sign a Nano send state block for exactly the quoted amount.
4. Retry the same POST with `PAYMENT-SIGNATURE: base64(PaymentPayload)`.
5. Read `PAYMENT-RESPONSE` and the courier result.

Compatible client reference: <https://github.com/pursekeeper/api/blob/main/examples/client-x402.js>.

## Safety and idempotency

- The service pre-reads `block_info` before any broadcast.
- It performs at most one `process` request per paid invocation.
- A confirmed duplicate returns its existing evidence and is never resent.
- A processed-but-unconfirmed block fails with an explicit inspect-before-retry message.
- Bad or missing fixtures are rejected after payment with a no-repay recovery instruction; seller support must reuse the settlement instead of charging again.

## Source layout

The deployed function is [`../api/courier.js`](../api/courier.js). Deployment configuration is [`../vercel.json`](../vercel.json) and runtime dependencies are [`../package.json`](../package.json).

MIT licensed.
