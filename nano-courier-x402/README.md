# Wallenhof Nano Courier — x402 seller

Program-callable, non-custodial courier for a pre-signed Nano state block.

## Source contract — original Vercel host disabled

**The original Vercel endpoint is disabled. Do not send payments to it.** For new separately paid requests, consult the [current recovery route and limitations](../README.md). The behavior below describes the checked-in source; it does not establish the deployed recovery host's implementation or a successful paid delivery.

- `GET /api/courier` returns service metadata without charge when the selected host is operational.
- `POST /api/courier` without payment returns HTTP 402.
- Payment scheme: x402 v2 `exact` on `nano:mainnet`.
- Price: `0.25 XNO` (`250000000000000000000000000000` raw).
- Payment address: `nano_1bfapscrwk7t66faz9emcqo318698d4yc9n7p8rh8gjuttg8ehgajgzw4bk1`.
- Paid input: `{ "block": { ...signed Nano state block without work... }, "subtype": "send|receive|open|change" }`.

The source validates block fields and its signature before payment settlement, checks for an existing block, obtains and validates Nano work, makes at most one broadcast `process` request *per invocation*, and polls independent RPCs for confirmation. Per-invocation behavior is **not** proof of concurrency-safe exactly-once processing across multiple paid requests or hosts. It returns the computed hash, work, named work/broadcast/confirmation sources, process response, confirmation evidence, and timestamps.

It never receives a seed or private key. The x402 payment is settled by the public, non-custodial facilitator at `facilitator.pursekeeper.dev`; the payment block sends XNO directly to the seller address.

## Buyer flow (new recovery-host requests only)

1. Check the [current recovery endpoint](../README.md) and probe its POST endpoint and read the base64 JSON `PAYMENT-REQUIRED` header.
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
- A missing/invalid signed block is rejected with HTTP 422 **before settlement** (`paid:false`); this does not mean a buyer should blindly replay a payment if its status is uncertain.
- With valid input, the source settles an x402 payment **before** attempting work generation/broadcast/confirmation. A subsequent failure returns `paid:true` and requires manual reconciliation, not a second charge. Do not advertise a per-confirmed-block guarantee.
- A completed paid request, concurrency-safe idempotency across simultaneous valid requests, and authenticated redemption of earlier prepaid orders have **not** been demonstrated by this source README. Existing prepaid customers must not be charged again; refer to the [public order thread](https://github.com/TheAliphant/Sur/issues/2).

## Source layout

The deployed function is [`../api/courier.js`](../api/courier.js). Deployment configuration is [`../vercel.json`](../vercel.json) and runtime dependencies are [`../package.json`](../package.json).

MIT licensed.
