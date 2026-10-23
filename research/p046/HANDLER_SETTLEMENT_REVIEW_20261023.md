# P046 | ORIGINAL handler settlement-before-duplicate regression

Review-only QA, 23 October 2026 (Europe/Oslo). Do **not** merge/deploy without a separate scoped decision. Original source: `api/courier.js` blob `39e6bc122f16d17f0ae9abf47c048c8a8743c454`; this test aborts if the bytes differ.

Run from repository root with `node --test research/p046/handler_double_settlement_review.test.mjs`. No npm install or live endpoint is needed. The harness loads the **actual original** Courier handler in a Node VM with a synthetic `nanocurrency`, a synthetic x402 facilitator, and synthetic Nano RPC. All HTTP calls are intercepted locally; no real wallets, signatures, payment, broadcasts, or network activity. Tests are **not** proof of real-world double charging; they demonstrate the source ordering under two distinct *mock-approved* payment payloads.

### Observed new evidence
- Original-handler synthetic tests: **11/11 PASS**, local Node v26.4.0, 2026-10-23 09:33 CEST.
- For a **previously CONFIRMED block**, two independent synthetic payment payloads `p1` and `p2` each cause one `facilitator.settle`: **2 synthetic settlements, 0 work_generate, 0 process**. A concurrent variant also confirms two mock settlements.
- For **PUBLISHED** (not yet confirmed) hash: settlement occurs before source's `blockInfo` duplicate check.
- If both RPC paths fail and work cannot be generated, handler returns HTTP 422 `paid:true` after a mock settlement.
- Invalid input, absent payment, and rejected verification correctly avoid synthetic settlement. Original handler remains unchanged on `main`.

### Recovery and authorization gate (not implemented)
Before any production integration, require stable operation fingerprint and request-to-payment binding; native signed-block verification; two independent RPCs that fail closed on timeout/unknown rather than interpreting error as absence; durable cross-instance atomic idempotency with escrow/settlement-in-flight state; settlement reconciliation before automatic retry; confirmed-receipt recovery that performs *no new charge*; adversarial concurrent worker and crash tests. A process-local `Set` or module-scoped lock would be insufficient for Vercel workers.

This branch adds an original **source-bound regression only**, not production mitigation, payout changes, wallet changes, price change or sale. It is independent of P047, MACH, NOW, RR and MM/DF/MF. No live buyer/contact/payment attempted. Buyer need and existing P046 retry_at remain separate qualification gates.


### 2026-10-23 11:55 CEST — delivery-side at-most-once review refinement

A second source-bound concurrency issue was found in the REVIEW module: after payment was durably SETTLED, two workers could both enter `finishPaidDelivery` and call `deliver` for one block/receipt. Payment-level CAS alone does not protect against duplicate native `work_generate/process` calls.

Review branch commit `1572011b6cc9641da8765ce86524f3faab0fbd11` fixes this **in research-only code** by requiring an atomic `beginDelivery` CAS (`SETTLED -> DELIVERY_IN_FLIGHT`), requiring exact block hash plus `confirmed:true` before final `DELIVERED`, and requiring independent on-chain `CONFIRMED` evidence to reconcile an ambiguous delivery without blindly broadcasting again. The branch's existing mock store implements the contract only in memory; **it is not a production durable adapter or live RPC integration**.

The revised locally run source-pinned Node harness passed **21/21** tests on macOS Node v26.4.0 at 11:55 CEST, including 30 concurrent recovery attempts resulting in one synthetic `deliver` call, ambiguous delivery never retried blindly, and wrong-hash/unconfirmed responses not marked delivered. Original `api/courier.js` blob `39e6bc122f16d17f0ae9abf47c048c8a8743c454` remains unchanged; `main`, price, payTo, wallets, provider and production deployment untouched.

**Still blocked for release:** external transactional durable CAS that survives Vercel concurrency/restarts, native payment-to-service binding, trustworthy dual independent Nano RPC, actual facilitator receipt/status reconciliation, network partition and crash tests, authorized phased integration and deployment, plus independent actual buyer/payment intent. This research branch must not be merged or advertised as a live safety fix.