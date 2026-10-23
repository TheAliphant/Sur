// P046 review-only: actual Git blob 39e6bc1 source, synthetic facilitator + Nano RPC.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import crypto from 'node:crypto';
const PATH=process.env.P046_COURIER_SOURCE || new URL('../../api/courier.js', import.meta.url).pathname;
const original=fs.readFileSync(PATH,'utf8');
const digest=crypto.createHash('sha1').update('blob '+Buffer.byteLength(original)+'\0').update(original).digest('hex');
assert.equal(digest,'39e6bc122f16d17f0ae9abf47c048c8a8743c454','source mismatch: abort all tests');
const HASH='A'.repeat(64), ZERO='0'.repeat(64), BLOCK={account:'nano_SYNTHETIC_ACCOUNT',previous:'B'.repeat(64),representative:'nano_SYNTHETIC_REP',balance:'10',link:'C'.repeat(64),signature:'D'.repeat(128)};
const N={checkAddress:x=>String(x).startsWith('nano_'),hashBlock:()=>HASH,derivePublicKey:()=> 'X'.repeat(64),verifyBlock:()=>true,validateWork:()=>true};
function env({verify=true,existing='CONFIRMED',rpcBroken=false}={}){
 const calls={verify:0,settle:0,block_info:0,work_generate:0,process:0}, payments=[];
 const response=(body,status=200)=>({ok:status>=200&&status<300,status, text:async()=>JSON.stringify(body)});
 const fetch=async(url,opt)=>{
 const body=JSON.parse(opt.body);
 if(url.includes('facilitator.pursekeeper.dev')){
    if(url.endsWith('/verify')){calls.verify++;return response({isValid:verify});}
    if(url.endsWith('/settle')){calls.settle++;payments.push(body.paymentPayload?.proof);return response({success:true,transaction:'SYNTHETIC_'+calls.settle});}
    throw Error('unexpected facilitator URL');
 }
 switch(body.action){
  case 'block_info':calls.block_info++;return response(rpcBroken?{error:'offline'}:existing==='CONFIRMED'?{block_account:'nano_SYNTHETIC_ACCOUNT',confirmed:'true'}:existing==='PUBLISHED'?{block_account:'nano_SYNTHETIC_ACCOUNT',confirmed:'false'}:{error:'Block not found'});
  case 'work_generate':calls.work_generate++;return response({error:'synthetic work intentionally unavailable'});
  case 'process':calls.process++;throw Error('process must never be called in these tests');
  default:throw Error('unexpected native RPC action '+body.action);
 }
 };
 const module={exports:{}};
 vm.runInNewContext(original,{require:x=>{assert.equal(x,'nanocurrency');return N;},module,Buffer,fetch,setTimeout,clearTimeout,AbortController,Date,console},{filename:'SOURCE_39e6bc1_courier.js'});
 const handler=module.exports;
 const header=(label)=>Buffer.from(JSON.stringify({proof:label}),'utf8').toString('base64');
 const request=(label,block=BLOCK)=>({method:'POST',url:'/api/courier',headers:{host:'synthetic.example','payment-signature':header(label)},body:{subtype:'send',block}});
 const responseSink=()=>{const out={statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(s){this.body=s?JSON.parse(s):null;}};return out;};
 const invoke=async(req)=>{let res=responseSink();await handler(req,res);return res;};
 return {calls,payments,handler,request,invoke,header};
}
test('native original Git blob exactly pinned',()=>{assert.equal(digest,'39e6bc122f16d17f0ae9abf47c048c8a8743c454');});
test('GET does not charge and returns metadata',async()=>{const e=env();const r=await e.invoke({method:'GET',headers:{host:'synthetic.example'},url:'/api/courier'});assert.equal(r.statusCode,200);assert.equal(e.calls.settle,0);});
test('missing payment returns 402 without settlement',async()=>{const e=env();const req=e.request('p1');delete req.headers['payment-signature'];const r=await e.invoke(req);assert.equal(r.statusCode,402);assert.equal(e.calls.settle,0);});
test('provider rejected verification: no settlement',async()=>{const e=env({verify:false});const r=await e.invoke(e.request('p1'));assert.equal(r.statusCode,402);assert.equal(e.calls.settle,0);});
test('bad signed service fixture fails before settlement',async()=>{const e=env();const r=await e.invoke(e.request('p1',{...BLOCK,signature:'bad'}));assert.equal(r.statusCode,422);assert.equal(r.body.paid,false);assert.equal(e.calls.settle,0);});
test('CONFIRMED already published block nevertheless settles new synthetic payment',async()=>{const e=env();const r=await e.invoke(e.request('p1'));assert.equal(r.statusCode,200);assert.equal(r.body.courier.status,'CONFIRMED');assert.equal(r.body.courier.process_attempts,0);assert.equal(e.calls.settle,1);assert.ok(e.calls.block_info>=1);});
test('same confirmed hash with SECOND distinct approved synthetic payment settles AGAIN',async()=>{const e=env();const a=await e.invoke(e.request('p1'));const b=await e.invoke(e.request('p2'));assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);assert.equal(e.calls.settle,2);assert.deepEqual(e.payments,['p1','p2']);assert.equal(e.calls.work_generate,0);assert.equal(e.calls.process,0);});
test('concurrent distinct synthetic payments against same confirmed hash also settle twice',async()=>{const e=env();const arr=await Promise.all([e.invoke(e.request('p1')),e.invoke(e.request('p2'))]);assert.ok(arr.every(r=>r.statusCode===200));assert.equal(e.calls.settle,2);assert.equal(e.calls.process,0);});
test('already PUBLISHED (unconfirmed) also charges before duplicate recognition',async()=>{const e=env({existing:'PUBLISHED'});const r=await e.invoke(e.request('p1'));assert.equal(r.statusCode,200);assert.equal(r.body.courier.status,'PUBLISHED');assert.equal(e.calls.settle,1);});
test('RPC ambiguity + failed work still settles payment before returning paid:true 422',async()=>{const e=env({rpcBroken:true});const r=await e.invoke(e.request('p1'));assert.equal(r.statusCode,422);assert.equal(r.body.paid,true);assert.equal(e.calls.settle,1);assert.ok(e.calls.block_info>=2);assert.equal(e.calls.process,0);});
test('test never calls live facilitator or RPC: all fetches mocked and process calls 0',async()=>{const e=env();await e.invoke(e.request('p1'));assert.equal(e.calls.process,0);});
