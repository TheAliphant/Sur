'use strict';
// P046 REVIEW ONLY, 2026-10-23. Never import from production without a durable
// cross-instance store, native block validation, dual-RPC semantics and scoped approval.
// The original source SHA is pinned in the accompanying integration-contract tests.
// No wallet, payTo, facilitator, price, or on-chain call exists in this file.

const HEX64 = /^[0-9A-F]{64}$/;
const ALLOWED = new Set(['ABSENT_BOTH', 'PUBLISHED', 'CONFIRMED', 'UNKNOWN']);
function safeJob(job) {
  if (!job || !HEX64.test(String(job.hash || '')) || !HEX64.test(String(job.paymentFingerprint || '')))
    return false;
  return ['send', 'receive', 'open', 'change'].includes(job.subtype);
}
function requireDeps(deps) {
  for (const key of ['validateSignedBlock','verifyPayment','checkTwoIndependentRpcs','store','settle','deliver']) {
    if (!deps || !deps[key]) throw new Error('REVIEW_CONFIGURATION_MISSING:' + key);
  }
  if (typeof deps.store.peek !== 'function' || typeof deps.store.claim !== 'function' ||
      typeof deps.store.beginSettlement !== 'function' || typeof deps.store.markSettled !== 'function' ||
      typeof deps.store.markDelivered !== 'function')
    throw new Error('DURABLE_ATOMIC_STORE_REQUIRED');
}
// Store contract (not an implementation): claim MUST be atomic across Vercel workers;
// beginSettlement MUST independently be a compare-and-swap RESERVED -> IN_FLIGHT
// returning true ONLY for one winner, even if concurrent claim() sees RESERVED.
// peek MUST return CONFLICT for a different payment fingerprint and permit settled
// receipt recovery even after an independent RPC sees the service block as published.
// Key by canonical signed-block hash; retain IN_FLIGHT/SETTLED/DELIVERED durably.
// A crash after facilitator settle but before markSettled MUST NOT trigger re-settle.
async function guardedCourier(job, deps) {
  try { requireDeps(deps); } catch (error) { return {status:'CONFIG_BLOCKED', paid:false, reason:error.message}; }
  if (!safeJob(job)) return {status:'INVALID_JOB',paid:false};
  if (await deps.validateSignedBlock(job) !== true) return {status:'INVALID_SIGNATURE',paid:false};
  if (await deps.verifyPayment(job) !== true) return {status:'UNVERIFIED_PAYMENT',paid:false};

  // Durable prior paid state takes precedence over chain state: never force a second
  // payment because the original work block is now already published.
  let prior;
  try { prior=await deps.store.peek(job.hash,job.paymentFingerprint); }
  catch { return {status:'DURABLE_STORE_UNCERTAIN',paid:'UNKNOWN'}; }
  if (prior?.state === 'CONFLICT') return {status:'ANOTHER_PAYMENT_OR_JOB',paid:false};
  if (prior?.state === 'DELIVERED') return {status:'ALREADY_DELIVERED',paid:true,receipt:prior.receipt};
  if (prior?.state === 'IN_FLIGHT') return {status:'RECONCILE_SETTLEMENT_FIRST',paid:'UNKNOWN'};
  if (prior?.state === 'SETTLED') return finishPaidDelivery(job,deps,prior.receipt);
  if (prior && prior.state !== 'RESERVED') return {status:'UNKNOWN_STORE_STATE',paid:'UNKNOWN'};

  let observed;
  try { observed=await deps.checkTwoIndependentRpcs(job.hash); }
  catch { observed='UNKNOWN'; }
  if (!ALLOWED.has(observed) || observed === 'UNKNOWN') return {status:'RPC_UNCERTAIN',paid:false};
  if (observed !== 'ABSENT_BOTH') return {status:'BLOCK_ALREADY_SEEN',paid:false};

  let claim;
  try { claim=await deps.store.claim(job.hash,job.paymentFingerprint); }
  catch { return {status:'DURABLE_STORE_UNCERTAIN',paid:false}; }
  if (!claim || claim.state === 'CONFLICT') return {status:'ANOTHER_PAYMENT_OR_JOB',paid:false};
  if (claim.state === 'DELIVERED') return {status:'ALREADY_DELIVERED',paid:true,receipt:claim.receipt};
  if (claim.state === 'IN_FLIGHT') return {status:'RECONCILE_SETTLEMENT_FIRST',paid:'UNKNOWN'};
  if (!['RESERVED','SETTLED'].includes(claim.state))
    return {status:'UNKNOWN_STORE_STATE',paid:'UNKNOWN'};

  let receipt=claim.receipt;
  if (claim.state === 'RESERVED') {
    // Check again after gaining the atomic lease; a different broadcaster could have
    // published the same signed block during our validation window.
    let second;
    try { second=await deps.checkTwoIndependentRpcs(job.hash); }
    catch { second='UNKNOWN'; }
    if (second !== 'ABSENT_BOTH') return {status:'POST_RESERVE_RPC_UNCERTAIN_OR_SEEN',paid:false};
    // Persist IN_FLIGHT BEFORE any facilitator call. Its ambiguous outcome is NEVER
    // automatically retried; reconcile with provider-side settlement proof instead.
    let acquired;
    try { acquired=await deps.store.beginSettlement(job.hash,job.paymentFingerprint); }
    catch { return {status:'CANNOT_DURABLY_BEGIN_SETTLEMENT',paid:'UNKNOWN'}; }
    if (acquired !== true) return {status:'SETTLEMENT_ALREADY_IN_FLIGHT_OR_SETTLED',paid:'UNKNOWN'};
    try { receipt=await deps.settle(job); }
    catch { return {status:'SETTLEMENT_UNKNOWN_RECONCILE',paid:'UNKNOWN'}; }
    if (!receipt || receipt.success !== true)
      return {status:'SETTLEMENT_FAILED_REVIEW',paid:'UNKNOWN'};
    try { await deps.store.markSettled(job.hash,job.paymentFingerprint,receipt); }
    catch { return {status:'SETTLED_BUT_STORE_UNCERTAIN',paid:true}; }
  }
  return finishPaidDelivery(job,deps,receipt);
}
async function finishPaidDelivery(job,deps,receipt){
  // Existing durable settled receipt; does not invoke facilitator settlement.
  if (!receipt || receipt.success !== true) return {status:'RECEIPT_UNVERIFIED_RECONCILE',paid:'UNKNOWN'};
  let delivery;
  try { delivery=await deps.deliver(job,receipt); }
  catch { return {status:'PAID_RECOVERY_REQUIRED',paid:true,receipt}; }
  try { await deps.store.markDelivered(job.hash,job.paymentFingerprint,receipt,delivery); }
  catch { return {status:'DELIVERED_STORE_UNCERTAIN',paid:true,receipt}; }
  return {status:'DELIVERED',paid:true,receipt,delivery};
}
module.exports={guardedCourier};
