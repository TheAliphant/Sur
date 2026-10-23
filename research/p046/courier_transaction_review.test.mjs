// P046: zero-network review-only source-bound transactional state contract.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {guardedCourier}=require('./courier_transaction_review.cjs');
const original=fs.readFileSync(new URL('../../api/courier.js',import.meta.url));
const originalBlob=crypto.createHash('sha1').update('blob '+original.length+'\0').update(original).digest('hex');
const SOURCE='39e6bc122f16d17f0ae9abf47c048c8a8743c454';
const HASH='A'.repeat(64), FP1='B'.repeat(64), FP2='C'.repeat(64);
function env({rpc='ABSENT_BOTH',signature=true,verified=true,settleFails=false,deliverFails=false}={}){
 const ledger=new Map();
 const counts={settle:0,deliver:0,claim:0,markInFlight:0,blockInfo:0};
 const store={
   async claim(hash,fp){
     counts.claim++;
     let item=ledger.get(hash);
     if(!item){item={state:'RESERVED',fp};ledger.set(hash,item);return {state:'RESERVED'};}
     if(item.fp!==fp)return {state:'CONFLICT'};
     return {...item};
   },
   async markInFlight(hash,fp){counts.markInFlight++;const i=ledger.get(hash);assert.equal(i.fp,fp);i.state='IN_FLIGHT';},
   async markSettled(hash,fp,receipt){const i=ledger.get(hash);assert.equal(i.fp,fp);i.receipt=receipt;i.state='SETTLED';},
   async markDelivered(hash,fp,receipt,delivery){const i=ledger.get(hash);assert.equal(i.fp,fp);i.receipt=receipt;i.delivery=delivery;i.state='DELIVERED';},
 };
 const deps={
   validateSignedBlock:async()=>signature,
   verifyPayment:async()=>verified,
   checkTwoIndependentRpcs:async()=>{counts.blockInfo++;return rpc;},
   store,
   settle:async()=>{counts.settle++;if(settleFails)throw Error('synthetic uncertain facilitator');return {success:true,receipt:'SYNTHETIC_PAYER_RECEIPT'};},
   deliver:async()=>{counts.deliver++;if(deliverFails)throw Error('synthetic temporary delivery failure');return {hash:HASH,confirmed:true};}
 };
 const job=fp=>({hash:HASH,paymentFingerprint:fp,subtype:'send'});
 const run=(fp=FP1)=>guardedCourier(job(fp),deps);
 return {ledger,counts,deps,job,run};
}
test('test is pinned to the actual immutable original handler blob',()=>assert.equal(originalBlob,SOURCE));
test('rejects invalid hash before touching payment or RPC',async()=>{const e=env();const r=await guardedCourier({...e.job(FP1),hash:'bad'},e.deps);assert.equal(r.status,'INVALID_JOB');assert.equal(e.counts.settle,0);});
test('rejects missing durable store before any payment',async()=>{const e=env();delete e.deps.store;const r=await e.run();assert.equal(r.status,'CONFIG_BLOCKED');assert.equal(e.counts.settle,0);});
test('fails closed on invalid block signature',async()=>{const e=env({signature:false});assert.equal((await e.run()).status,'INVALID_SIGNATURE');assert.equal(e.counts.settle,0);});
test('fails closed on unverified payment proof',async()=>{const e=env({verified:false});assert.equal((await e.run()).status,'UNVERIFIED_PAYMENT');assert.equal(e.counts.settle,0);});
for(const rpc of ['PUBLISHED','CONFIRMED','UNKNOWN','INVALID_STATE'])
 test('never settles on remote block state '+rpc,async()=>{const e=env({rpc});const r=await e.run();assert.equal(r.paid,false);assert.equal(e.counts.settle,0);});
test('successful request persists one synthetic settlement and deliver',async()=>{const e=env();const r=await e.run();assert.equal(r.status,'DELIVERED');assert.equal(e.counts.settle,1);assert.equal(e.ledger.get(HASH).state,'DELIVERED');});
test('same job payment retry serves existing receipt without re-settlement',async()=>{const e=env();assert.equal((await e.run()).status,'DELIVERED');const r=await e.run();assert.equal(r.status,'ALREADY_DELIVERED');assert.equal(e.counts.settle,1);assert.equal(e.counts.deliver,1);});
test('a different payment cannot buy the same already delivered signed block',async()=>{const e=env();await e.run(FP1);const r=await e.run(FP2);assert.equal(r.status,'ANOTHER_PAYMENT_OR_JOB');assert.equal(e.counts.settle,1);});
test('ambiguous settlement failure is never automatically re-settled',async()=>{const e=env({settleFails:true});const a=await e.run();assert.equal(a.status,'SETTLEMENT_UNKNOWN_RECONCILE');const b=await e.run();assert.equal(b.status,'RECONCILE_SETTLEMENT_FIRST');assert.equal(e.counts.settle,1);});
test('paid but delivery failed can recover same receipt without another settlement',async()=>{const e=env({deliverFails:true});const a=await e.run();assert.equal(a.status,'PAID_RECOVERY_REQUIRED');e.deps.deliver=async()=>{e.counts.deliver++;return {confirmed:true,hash:HASH};};const b=await e.run();assert.equal(b.status,'DELIVERED');assert.equal(e.counts.settle,1);assert.equal(e.counts.deliver,2);});
test('concurrent distinct payment fingerprints produce exactly one mock settlement',async()=>{const e=env();const out=await Promise.all(Array.from({length:20},(_,i)=>e.run(i%2?FP1:FP2)));assert.equal(e.counts.settle,1);assert.equal(out.filter(x=>x.status==='DELIVERED').length,1);});
test('no network APIs or real facilitator are needed for this synthetic test',async()=>{const e=env();const r=await e.run();assert.equal(r.status,'DELIVERED');assert.equal(e.counts.blockInfo,2);});
