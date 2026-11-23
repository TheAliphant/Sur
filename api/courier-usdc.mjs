CONFIRM_RPC = 'https://node.somenano.com/proxy';
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
      completed_at: new Date().toISOString()
    };
  }
  
  let broadcastResult = null;
  for (const url of [BROADCAST_RPC, CONFIRM_RPC]) {
    try {
      const res = await rpc(url, { action: 'process', json_block: 'true', subtype, block }, 10000);
      if (res && !res.error && (res.hash || res.started)) {
        broadcastResult = { url, result: res };
        break;
      }
    } catch {}
  }

  if (!broadcastResult) {
    throw new Error('Failed to broadcast block to any RPC node');
  }

  let confirmed = null;
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    const info = await blockInfo(hash);
    if (info && info.result.confirmed === 'true') {
      confirmed = info;
      break;
    }
  }

  return {
    status: confirmed ? 'CONFIRMED' : 'PUBLISHED',
    duplicate_safe: false,
    process_attempts: 1,
    computed_hash: hash,
    broadcast_rpc: broadcastResult.url,
    broadcast_response: broadcastResult.result,
    confirmation_rpc: confirmed ? confirmed.url : null,
    confirmation: confirmed ? confirmed.result : null,
    started_at: startedAt,
    completed_at: new Date().toISOString()
  };
}

export default courier;