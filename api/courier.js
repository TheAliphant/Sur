'use strict';

const N = require('nanocurrency');

const PAY_TO = 'nano_1bfapscrwk7t66faz9emcqo318698d4yc9n7p8rh8gjuttg8ehgajgzw4bk1';
const AMOUNT_RAW = '250000000000000000000000000000'; // 0.25 XNO
const FACILITATOR = 'https://facilitator.pursekeeper.dev';
const WORK_RPC = 'https://nanoslo.0x.no/proxy';
const BROADCAST_RPC = 'https://nanoslo.0x.no/proxy';
const CONFIRM_RPC = 'https://node.somenano.com/proxy';
const ZERO = '0'.repeat(64);
const LOW_THRESHOLD = 'fffffe0000000000';
const SEND_THRESHOLD = 'fffffff800000000';

const json = (res, status, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
};

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64');
const unb64 = value => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function rpc(url, payload, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'wallenhof-nano-courier/1.0' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: `non-JSON RPC response (${response.status})` }; }
    if (!response.ok && !body.error) body.error = `HTTP ${response.status}`;
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function canonicalBlock(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('body.block is required');
  const block = {
    type: 'state',
    account: String(raw.account || '').replace(/^xrb_/, 'nano_'),
    previous: String(raw.previous || '').toUpperCase(),
    representative: String(raw.representative || '').replace(/^xrb_/, 'nano_'),
    balance: String(raw.balance || ''),
    link: String(raw.link || '').toUpperCase(),
    signature: String(raw.signature || '').toUpperCase(),
    work: raw.work ? String(raw.work).toLowerCase() : '',
  };
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
  const hash = N.hashBlock({
    account: block.account,
    previous: block.previous,
    representative: block.representative,
    balance: block.balance,
    link: block.link,
  });
  const publicKey = N.derivePublicKey(block.account);
  if (!N.verifyBlock({ hash, signature: block.signature, publicKey })) throw new Error('bad block signature');
  return hash.toUpperCase();
}

async function blockInfo(hash) {
  for (const url of [CONFIRM_RPC, BROADCAST_RPC]) {
    try {
      const result = await rpc(url, { action: 'block_info', json_block: 'true', hash }, 10000);
      if (result && !result.error && result.block_account) return { url, result };
    } catch {}
  }
  return null;
}

async function courier(rawBlock, subtype) {
  const startedAt = new Date().toISOString();
  const block = canonicalBlock(rawBlock);
  const hash = validateSignedBlock(block, subtype);
  const existing = await blockInfo(hash);
  if (existing) {
    return {
      status: existing.result.confirmed === 'true' ? 'CONFIRMED' : 'PUBLISHED',
      duplicate_safe: true,
      process_attempts: 0,
      computed_hash: hash,
      confirmation_rpc: existing.url,
      confirmation: existing.result,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }

  const root = subtype === 'open' ? N.derivePublicKey(block.account) : block.previous;
  const threshold = ['receive', 'open'].includes(subtype) ? LOW_THRESHOLD : SEND_THRESHOLD;
  const workResult = await rpc(WORK_RPC, { action: 'work_generate', hash: root, difficulty: threshold }, 30000);
  if (!workResult.work) throw new Error(`work_generate failed: ${workResult.error || 'no work returned'}`);
  const work = String(workResult.work).toLowerCase();
  if (!N.validateWork({ blockHash: root, work, threshold })) throw new Error('work source returned invalid work');
  block.work = work;

  const processResponse = await rpc(BROADCAST_RPC, {
    action: 'process', json_block: 'true', subtype, block,
  }, 20000);
  if (!processResponse.hash) throw new Error(`process failed: ${processResponse.error || 'no hash returned'}`);
  if (String(processResponse.hash).toUpperCase() !== hash) throw new Error('process returned a different block hash');

  let confirmation = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const seen = await blockInfo(hash);
    if (seen && seen.result.confirmed === 'true') { confirmation = seen; break; }
    await sleep(1000);
  }
  if (!confirmation) throw new Error(`block ${hash} was processed but not confirmed within the polling window; inspect before retrying`);

  return {
    status: 'CONFIRMED',
    duplicate_safe: true,
    process_attempts: 1,
    computed_hash: hash,
    work,
    work_source: WORK_RPC,
    broadcast_rpc: BROADCAST_RPC,
    process_response: processResponse,
    confirmation_rpc: confirmation.url,
    confirmation: confirmation.result,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}

function requirements(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'nano-courier-x402.vercel.app').split(',')[0];
  const url = `${proto}://${host}${req.url || '/api/courier'}`;
  const accepted = {
    scheme: 'exact', network: 'nano:mainnet', amount: AMOUNT_RAW, asset: 'XNO',
    payTo: PAY_TO, maxTimeoutSeconds: 60,
  };
  return {
    accepted,
    paymentRequired: {
      x402Version: 2,
      resource: {
        url,
        description: 'Verify and courier one pre-signed Nano state block, add work, broadcast exactly once, and return confirmation evidence.',
        mimeType: 'application/json',
      },
      accepts: [accepted],
    },
  };
}

async function facilitatorCall(path, paymentPayload, accepted) {
  const response = await fetch(`${FACILITATOR}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'wallenhof-nano-courier/1.0' },
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: accepted }),
  });
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { return { success: false, isValid: false, errorReason: 'facilitator_non_json', detail: `HTTP ${response.status}` }; }
}

async function decodeAndVerifyPayment(encoded, accepted) {
  let paymentPayload;
  try { paymentPayload = unb64(encoded); }
  catch (error) { return { paymentPayload: null, verification: { isValid: false, invalidReason: 'invalid_payment_header', detail: error.message } }; }
  const verification = await facilitatorCall('verify', paymentPayload, accepted);
  return { paymentPayload, verification };
}

module.exports = async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,payment-signature,x-payment');
  res.setHeader('access-control-expose-headers', 'payment-required,payment-response');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET') return json(res, 200, {
    service: 'Wallenhof Nano Courier', version: '1.0.0', status: 'READY',
    endpoint: '/api/courier', method: 'POST', price: '0.25 XNO',
    payment: { x402Version: 2, scheme: 'exact', network: 'nano:mainnet', asset: 'XNO', payTo: PAY_TO },
    input: { block: 'pre-signed Nano state block without work', subtype: 'send|receive|open|change' },
    output: 'computed hash, work source, work, process response, independent confirmation evidence, timestamps',
    custody: false,
    source: 'https://github.com/TheAliphant/Sur/blob/main/api/courier.js',
  });
  if (req.method !== 'POST') return json(res, 405, { error: 'GET for service metadata; POST a courier job' });

  const { accepted, paymentRequired } = requirements(req);
  const requiredHeader = b64(paymentRequired);
  const payment = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!payment) return json(res, 402, {
    error: 'payment_required', x402: paymentRequired,
  }, { 'PAYMENT-REQUIRED': requiredHeader });

  const { paymentPayload, verification } = await decodeAndVerifyPayment(String(payment), accepted);
  if (!verification.isValid) return json(res, 402, {
    error: 'payment_invalid', detail: verification, x402: paymentRequired,
  }, { 'PAYMENT-REQUIRED': requiredHeader });

  // Fail bad service input before settlement. The client's signed payment block is still
  // unpublished and can be retried with a corrected fixture; no money has moved yet.
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const block = canonicalBlock(body.block);
    validateSignedBlock(block, String(body.subtype || '').toLowerCase());
  } catch (error) {
    return json(res, 422, { ok: false, paid: false, error: error.message, recovery: 'Correct the fixture and retry with the same unsigned/unsettled payment payload.' });
  }

  const settlement = await facilitatorCall('settle', paymentPayload, accepted);
  if (!settlement.success) return json(res, 402, {
    error: 'payment_settlement_failed', detail: settlement, x402: paymentRequired,
  }, { 'PAYMENT-REQUIRED': requiredHeader });

  const paymentResponse = b64(settlement);
  try {
    const result = await courier(body.block, String(body.subtype || '').toLowerCase());
    return json(res, 200, { ok: true, payment: settlement, courier: result }, { 'PAYMENT-RESPONSE': paymentResponse });
  } catch (error) {
    return json(res, 422, {
      ok: false,
      paid: true,
      error: error.message,
      recovery: 'Payment is recognized. Correct the fixture and contact the seller with the transaction hash; do not repay or blindly retry a processed block.',
      payment: settlement,
    }, { 'PAYMENT-RESPONSE': paymentResponse });
  }
};
