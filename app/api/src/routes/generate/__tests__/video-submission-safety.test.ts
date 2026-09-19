import {test,expect,vi} from 'vitest';
vi.mock('@beike/server-kit/prisma',()=>({prisma:{imageTask:{create:vi.fn(async()=>({id:'mock-record'})),upsert:vi.fn(async()=>({id:'mock-record'}))}}}));
vi.mock('@beike/server-kit/storage',()=>({persistMediaUrl:vi.fn(),extractStorageConfigFromRequest:vi.fn()}));
vi.mock('@beike/server-kit/imageConverter',()=>({convertToStandardJpegDataUrl:vi.fn()}));
vi.mock('@beike/domain/gatewayCreds',()=>({resolveGatewayCreds:()=>({baseUrl:'https://provider.invalid',apiKey:'audit'})}));
vi.mock('../../../services/gatewayCredentials',()=>({getDefaultBaseUrl:()=> 'https://provider.invalid',getDefaultApiKey:()=> 'audit'}));
import {POST} from '../video';
test('ambiguous timeout never submits to another endpoint',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:any)=>{calls.push(String(url)); if(calls.length===1)throw new Error('Timeout after upstream accepted');return Response.json({task_id:'mock-task'})}));
 const response=await POST(new Request('http://localhost/api/generate/video',{method:'POST',body:JSON.stringify({prompt:'audit',model:'veo3.1',clientTaskId:'video-audit'})}));
 expect(calls).toHaveLength(1);expect(response.status).toBe(503);
 expect((await response.clone().json()).submissionUnknown).toBe(true);
 vi.unstubAllGlobals();
});
