import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImagePollPayload as parse} from './imagePollPayload.ts';
test('query route, authentication, throttling and server failures never become task failures',()=>{
 for(const code of [401,403,404,429,500,503]) assert.equal(parse({status:'ERROR',error:{message:`HTTP ${code}`}},false),null);
 assert.equal(parse({error:{message:'Invalid URL'}}),null);
 assert.equal(parse({status:'error',message:'unauthorized'}),null);
});
test('normal response messages and transient warnings do not fail running tasks',()=>{
 for(const message of ['success','请求成功','processing']) assert.equal(parse({message,data:{status:'IN_PROGRESS',progress:'30%'}}).status,'IN_PROGRESS');
 assert.equal(parse({status:'PENDING',fail_reason:'暂时无法查询'}).status,'IN_PROGRESS');
});
test('nested task state overrides success transport envelope',()=>{
 assert.equal(parse({status:'success',data:{status:'PENDING'}}).status,'IN_PROGRESS');
 assert.equal(parse({status:'success',data:{status:'FAILED',fail_reason:'rejected'}}).failReason,'rejected');
});
test('JSON-encoded synchronous-to-asynchronous image results are extracted',()=>{
 const url='https://cdn.example/result.png';
 for(const data of [JSON.stringify({data:[{url}]}),{data:[{url}]},{result:{images:[{url}]}},{output:[url]}]) {
  const result=parse({data:{status:'SUCCESS',data}});
  assert.equal(result.status,'SUCCESS');assert.equal(result.resultUrl,url);assert.equal(result.failReason,'');
 }
});
test('a valid result wins over stale failure fields, while missing results remain pending',()=>{
 assert.equal(parse({status:'SUCCESS',message:'ok'}).status,'IN_PROGRESS');
 assert.equal(parse({status:'FAILED',url:'https://cdn.example/result.png',error:'stale'}).status,'SUCCESS');
 assert.equal(parse({data:{status:'FAILED',error:{message:'upstream rejection'}}}).status,'FAILURE');
});
test('base64 result and object image_url are supported without interpreting arbitrary messages as images',()=>{
 assert.equal(parse({status:'SUCCESS',data:[{b64_json:'abc'}]}).resultUrl,'data:image/png;base64,abc');
 assert.equal(parse({data:{image_url:{url:'https://cdn.example/a.png'}}}).status,'SUCCESS');
 assert.equal(parse({message:'https://not-a-result.example/help'}),null);
});
