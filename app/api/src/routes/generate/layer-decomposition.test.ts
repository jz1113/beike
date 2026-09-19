import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../services/gatewayCredentials',()=>({resolveCredentials:()=>({baseUrl:'https://gateway.example',apiKey:'test-key'})}));
vi.mock('../../services/submissionGuard',()=>({guardSubmission:(_req:Request,_kind:string,_creds:unknown,run:()=>Promise<Response>)=>run()}));
vi.mock('./image/poll',()=>({ensurePersistableResultUrl:async(url:string)=>url}));
vi.mock('@beike/server-kit/storage',()=>({extractStorageConfigFromRequest:()=>undefined,persistMediaUrl:async()=>null}));
import {POST} from './layer-decomposition';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const request=()=>new Request('http://localhost/api/generate/layer-decomposition',{method:'POST',body:JSON.stringify({model:'seedream-v5-pro/layer-decomposition',image:'data:image/png;base64,AAAA',prompt:'拆分人物',size:'auto'})});
it('sends the gateway model with official decomposition fields and keeps every layer',async()=>{
 vi.stubEnv('LAYER_GATEWAY_CONFIRMED','true');vi.stubEnv('LAYER_GATEWAY_MODEL','seedream-v5-pro');vi.stubEnv('ARK_LAYER_API_KEY','');
 const fetch=vi.fn(async()=>Response.json({data:[{url:'https://example.com/base.png',size:'512x512',z_index:0},{url:'https://example.com/a.png',size:'100x100',z_index:1,bounding_box:{absolute:[0,0,99,99]}}]}));vi.stubGlobal('fetch',fetch);
 const result=await POST(request());expect(result.status).toBe(200);expect((await result.json()).layers).toHaveLength(2);
 const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://gateway.example/v1/images/generations');
 expect(JSON.parse(String(init.body))).toMatchObject({model:'seedream-v5-pro',layer_decomposition:true,output_format:'png',watermark:false});
});
it('does not retry an unsupported or failed gateway request',async()=>{
 vi.stubEnv('LAYER_GATEWAY_CONFIRMED','true');vi.stubEnv('LAYER_GATEWAY_MODEL','seedream-v5-pro');vi.stubEnv('ARK_LAYER_API_KEY','');
 const fetch=vi.fn(async()=>Response.json({error:{message:'unsupported model'}},{status:400}));vi.stubGlobal('fetch',fetch);
 expect((await POST(request())).status).toBe(502);expect(fetch).toHaveBeenCalledTimes(1);
});

it('accepts successful gateway URL-only results without an availability gate',async()=>{
 vi.stubEnv('ARK_LAYER_API_KEY','');vi.stubEnv('LAYER_GATEWAY_MODEL','');
 const fetch=vi.fn(async()=>Response.json({status:'SUCCESS',data:{data:[{url:'https://example.com/a.png',b64_json:''},{url:'https://example.com/b.png',b64_json:''}]}}));vi.stubGlobal('fetch',fetch);
 const response=await POST(request());expect(response.status).toBe(200);
 expect((await response.json()).layers).toMatchObject([{placement:'separate'},{placement:'separate'}]);
 expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body))).toMatchObject({model:'seedream-v5-pro/layer-decomposition',image:'data:image/png;base64,AAAA'});
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('uses the official Ark route and model rather than the gateway page title',async()=>{
 vi.stubEnv('ARK_LAYER_API_KEY','test-ark');vi.stubEnv('ARK_LAYER_MODEL','doubao-seedream-5-0-pro-260628');
 const fetch=vi.fn(async()=>Response.json({error:{message:'test'}},{status:400}));vi.stubGlobal('fetch',fetch);
 await POST(request());
 const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
 expect(JSON.parse(String(init.body))).toMatchObject({model:'doubao-seedream-5-0-pro-260628',image:'data:image/png;base64,AAAA',layer_decomposition:true});
});
