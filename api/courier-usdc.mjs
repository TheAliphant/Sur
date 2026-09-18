import * as N from 'nanocurrency';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const PAY_TO = '0xB6313D094618B20DD29994Bec6697aE1e9F02DfE';
const PRICE = '$0.25';
const NETWORK = 'eip155:8453';
const FACILITATOR_URL = 'https://facilitator.openx402.ai';
const WORK_RPC = 'https://nanoslo.0x.no/proxy';
const BROADCAST_RPC = 'https://nanoslo.0x.no/proxy';
const CONFIRM_RPC = 'https://node.somenano.com/proxy';
const ZERO = '0'.repeat(64);
const LOW_THRESHOLD = 'fffffe0000000000';
const SEND_THRESHOLD = 'fffffff800000000';

const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
  .register(NETWORK, new ExactEvmScheme());
let initialized;
let requirementPromise;
const initialize = async () => { initialized ||= resourceServer.initialize(); await initialized; };
const requirement = async () => {
  await initialize();
  requirementPromise ||= resourceServer.buildPaymentRequirements({ scheme: 'exact', price: PRICE, network: NETWORK, payTo: PAY_TO, maxTimeoutSeconds: 60 }).then(items => items[0]);
  return requirementPromise;
};

const json = (res, status, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
};
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function rpc(url, payload, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'wallenhof-nano-courier-usdc/2.0' }, body: JSON.stringify(payload), signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: `non-JSON RPC response (${response.status})` }; }
    if (!response.ok && !body.error) body.error = `HTTP ${response.status}`;
    return body;
  } finally { clearTimeout(timer); }
}

function canonicalBlock(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('body.block is required');
  const block = { type: 'state', account: String(raw.account || '').replace(/^xrb_/, 'nano_'), previous: String(raw.previous || '').toUpperCase(), representative: String(raw.representative || '').replace(/^xrb_/, 'nano_'), balance: String(raw.balance || ''), link: String(raw.link || '').toUpperCase(), signature: String(raw.signature || '').toUpperCase(), work: raw.work ? String(raw.work).toLowerCase() : '' };
  if (!N.checkAddress(block.account)) throw new Error('invalid block.account');
  if (!N.checkAddress(block.representative)) throw new Error('invalid block.representative');
  if (!/^[0-9A-F]{64}$/.test(block.previous)) throw new Error('previous must be 64 hex characters');
  if (!/^\d+$/.test(block.balance)) throw new Error('balance must be an integer raw string');
  if (!/^[0-9A-F]{64}$/.test(block.link)) throw new Error('link must be 64 hex characters');
  if (!/^[0-9A-F]{128}$/.test(block.signature)) throw new Error('signature must be 128 hex characters');
  return block;
}

function validateSignedBlock(block, subtype) {
  if (!['send', 'receive', 'open', 'change'].includes(subtype)) throw new Error('subtype must be send, receive, open, or change');
  if ((subtype === 'open') !== (block.previous === ZERO)) throw new Error('open requires zero previous; non-open requires a frontier');
  const hash = N.hashBlock({ account: block.account, previous: block.previous, representative: block.representative, balance: block.balance, link: block.link });
  if (!N.verifyBlock({ hash, signature: block.signature, publicKey: N.derivePublicKey(block.account) })) throw new Error('bad block signature');
  return hash.toUpperCase();
}

async function blockInfo(hash) {
  for (const url of [CONFIRM_RPC, BROADCAST_RPC]) {
    try { const result = await rpc(url, { action: 'block_info', json_block: 'true', hash }, 10000); if (result && !result.error && result.block_account) return { url, result }; } catch {}
  }
  return null;
}

async function courier(rawBlock, subtype) {
  const startedAt = new Date().toISOString(); const block = canonicalBlock(rawBlock); const hash = validateSignedBlock(block, subtype);
  const existing = await blockInfo(hash);
  if (existing) return { status: existing.result.confirmed === 'true' ? 'CONFIRMED' : 'PUBLISHED', duplicate_safe: true, process_attempts: 0, computed_hash: hash, confirmation_rpc: existing.url, confirmation: existing.result, started_at: startedAt, completed_at: new Date().toISOString() };
  const root = subtype === 'open' ? N.derivePublicKey(block.account) : block.previous;
  const threshold = ['receive', 'open'].includes(subtype) ? LOW_THRESHOLD : SEND_THRESHOLD;
  const workResult = await rpc(WORK_RPC, { action: 'work_generate', hash: root, difficulty: threshold }, 30000);
  if (!workResult.work) throw new Error(`work_generate failed: ${workResult.error || 'no work returned'}`);
  const work = String(workResult.work).toLowerCase(); if (!N.validateWork({ blockHash: root, work, threshold })) throw new Error('work source returned invalid work'); block.work = work;
  const processResponse = await rpc(BROADCAST_RPC, { action: 'process', json_block: 'true', subtype, block }, 20000);
  if (!processResponse.hash) throw new Error(`process failed: ${processResponse.error || 'no hash returned'}`);
  if (String(processResponse.hash).toUpperCase() !== hash) throw new Error('process returned a different block hash');
  let confirmation = null; for (let attempt = 0; attempt < 12; attempt++) { const seen = await blockInfo(hash); if (seen && seen.result.confirmed === 'true') { confirmation = seen; break; } await sleep(1000); }
  if (!confirmation) throw new Error(`block ${hash} was processed but not confirmed within the polling window; inspect before retrying`);
  return { status: 'CONFIRMED', duplicate_safe: true, process_attempts: 1, computed_hash: hash, work, work_source: WORK_RPC, broadcast_rpc: BROADCAST_RPC, process_response: processResponse, confirmation_rpc: confirmation.url, confirmation: confirmation.result, started_at: startedAt, completed_at: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,payment-signature,x-payment');
  res.setHeader('access-control-expose-headers', 'payment-required,payment-response,x-payment-response');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET') return json(res, 200, { service: 'Wallenhof Nano Courier — Base USDC', version: '2.0.1', status: 'READY', endpoint: '/api/courier-usdc', method: 'POST', price: PRICE, payment: { x402Version: 2, scheme: 'exact', network: NETWORK, asset: 'USDC', payTo: PAY_TO, facilitator: FACILITATOR_URL }, input: { block: 'pre-signed Nano state block without work', subtype: 'send|receive|open|change' }, output: 'computed hash, work source, work, process response, independent confirmation evidence, timestamps', custody: false, settlement_order: 'validate input -> verify payment -> settle USDC -> courier block', source: 'https://github.com/TheAliphant/Sur/blob/main/api/courier-usdc.mjs' });
  if (req.method !== 'POST') return json(res, 405, { error: 'GET for service metadata; POST a courier job' });

  let body, block, subtype;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); subtype = String(body.subtype || '').toLowerCase(); block = canonicalBlock(body.block); validateSignedBlock(block, subtype); }
  catch (error) { return json(res, 422, { ok: false, paid: false, error: error.message, recovery: 'Correct the fixture before paying.' }); }

  const accepted = await requirement();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'nano-courier-x402.vercel.app').split(',')[0];
  const resourceInfo = { url: `${proto}://${host}${req.url || '/api/courier-usdc'}`, description: 'Verify and courier one pre-signed Nano state block, add work, broadcast exactly once, and return confirmation evidence.', mimeType: 'application/json' };
  const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!paymentHeader) {
    const required = await resourceServer.createPaymentRequiredResponse([accepted], resourceInfo);
    return json(res, 402, { error: 'payment_required', x402: required }, { 'PAYMENT-REQUIRED': b64(required) });
  }

  let payload;
  try { payload = JSON.parse(Buffer.from(String(paymentHeader), 'base64').toString('utf8')); }
  catch (error) { return json(res, 402, { error: 'invalid_payment_header', detail: error.message }); }

  let verification;
  try { verification = await resourceServer.verifyPayment(payload, accepted); }
  catch (error) { return json(res, 402, { error: 'payment_verification_failed', detail: error.message }); }
  if (!verification.isValid) return json(res, 402, { error: 'payment_invalid', detail: verification });

  let settlement;
  try { settlement = await resourceServer.settlePayment(payload, accepted); }
  catch (error) { return json(res, 402, { error: 'payment_settlement_failed', detail: error.message }); }
  if (!settlement.success) return json(res, 402, { error: 'payment_settlement_failed', detail: settlement });

  const paymentResponse = b64(settlement);
  try { const result = await courier(block, subtype); return json(res, 200, { ok: true, payment: settlement, courier: result }, { 'PAYMENT-RESPONSE': paymentResponse, 'X-PAYMENT-RESPONSE': paymentResponse }); }
  catch (error) { return json(res, 422, { ok: false, paid: true, error: error.message, recovery: 'Payment settled. Do not repay. Contact the seller with the settlement transaction hash for one replacement fixture.', payment: settlement }, { 'PAYMENT-RESPONSE': paymentResponse, 'X-PAYMENT-RESPONSE': paymentResponse }); }
}
