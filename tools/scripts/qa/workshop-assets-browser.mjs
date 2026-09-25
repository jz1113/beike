/* global document, innerWidth -- Playwright page callbacks. */
// Local-only integration QA. All API calls and generated images are mocked.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = await mkdtemp(join(tmpdir(), 'beike-workshop-assets-'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const calls = []; let failAssets = false; let failSave = false; let revision = 1;
const group = { id: 'g', title: '手机生活图组', registry: { status: 'published' }, sourceImageIndices: '[1,2,3,4]', shotPromptsJson: JSON.stringify([1,2,3,4].map(shot_no => ({shot_no, title:`手机镜头 ${shot_no}`, prompt: '展示手机', has_human: true}))) };
let groups = [group];
let outfits = [
 { id:'unknown', title:'无法确认' }, { id:'na',title:'不适用' }, {id:'empty',title:'无人像穿搭'},
 { id:'sleeve',title:'局部深色袖口',bottom:'无法确认',registry:{status:'published'} },
 { id:'draft',title:'待审白衬衫',registry:{status:'pending_review'} },
];
const settings = { selectedVisionModel:'gemini-3.7-flash', selectedImageGenModel:'gpt-image-2',selectedArchId:'recipe_phone_comms_master',selectedQuality:'high',selectedAspect:'3:4',selectedShotCount:4,useAssetLibrary:true,lockedPersonaId:'auto',lockedSceneId:'auto',lockedOutfitId:'unknown',lockedActionId:'auto',lockedFullPromptId:'auto',generationStrategy:'single_shot',autoGenerateCopywriting:false,personaMode:'asset_driven' };
const item = {id:'p',itemId:'123456',platform:'jd',title:'测试手机',price:99,category:'数码',brand:'测试',coverImage:'/test-product.svg',mainImages:['/test-product.svg'],skuImages:[],detailImages:[],props:{},status:'success',selected:true,allTypedImages:[{url:'/test-product.svg',type:'main'}],selectedProductImages:['/test-product.svg'],analyzedSuccess:false,prompts:[],tasks:[]};
const snapshot = {version:2,mode:'original',currentStage:2,batchInputText:'',settings,pipeline:{status:'draft',planRevision:0,storyboardRevision:0,diversityContext:{groupSignatures:[],actionIds:[],sceneIds:[]},runs:[]},items:[item]};
const batch = {id:'test-batch',name:'资产一致性验收',status:'draft',revision,snapshot,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
await page.route('**/*',async route => {
 const request = route.request(); const url = new URL(request.url());
 if(url.origin !== 'http://127.0.0.1:5173') return route.abort();
 if(url.pathname.endsWith('.svg') && url.pathname.includes('test-')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#e0e7ff"/><rect x="160" y="100" width="280" height="600" rx="35" fill="#475569"/></svg>'});
 if(!url.pathname.startsWith('/api/')) return route.continue();
 calls.push(`${request.method()} ${url.pathname}`);
 let status=200; let data={success:true,items:[],recipes:[],batches:[]};
 if(url.pathname==='/api/catalog/assets/library') {
  if(failAssets) { status=503; data={success:false,error:'模拟资产服务暂时不可用'}; }
  else data={success:true,personas:[],scenes:[],outfits,actions:[],fullPrompts:groups,items:url.searchParams.get('type')==='outfit'?outfits:url.searchParams.get('type')==='full_prompt'?groups:[],total:5,hasMore:false};
 } else if(url.pathname==='/api/catalog/workshop-batches/active') data={batch};
 else if(url.pathname==='/api/catalog/workshop-batches/test-batch' && request.method()==='PUT') {
  if(failSave) {status=500;data={error:'模拟保存失败'};} else {const body=request.postDataJSON();batch.snapshot=body.snapshot || batch.snapshot;data={revision:++revision,updatedAt:new Date().toISOString()};}
 } else if(url.pathname==='/api/generate/analyze') data={success:true,prompts:[1,2,3,4].map(shot_no=>({shot_no,title:`手机镜头 ${shot_no}`,prompt:`真实手机摄影第${shot_no}镜`,has_human:false})),modelUsed:'mock-vision'};
 else if(url.pathname==='/api/generate/image') data={success:true,status:'SUCCESS',taskId:`mock-${calls.length}`,resultUrl:'/test-result.svg'};
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
});
const body = () => page.locator('body').innerText();
const analyzeCount = () => calls.filter(call=>call==='POST /api/generate/analyze').length;
const generateCount = () => calls.filter(call=>call==='POST /api/generate/image').length;
try {
 await page.goto('http://127.0.0.1:5173/?view=workshop&step=2');
 await page.getByRole('button',{name:'确认选图，进入下一步',exact:true}).waitFor();
 await page.getByRole('button',{name:'工坊生产预设',exact:true}).click();
 const outfitSelect = page.getByLabel('穿搭',{exact:true});
 await page.getByText(/可用母本 1/).waitFor();
 assert.match(await outfitSelect.innerText(), /局部深色袖口/);
 for(const text of ['不适用','无人像穿搭','待审白衬衫']) assert.ok(!(await outfitSelect.innerText()).includes(text));
 assert.match(await outfitSelect.innerText(), /原选择已失效/);
 assert.ok(!(await body()).includes('修改已实时自动持久化'));
 await page.screenshot({path:join(evidence,'resource-status.png'),fullPage:true});
 await page.getByRole('button',{name:'完成',exact:true}).click();
 await page.getByRole('button',{name:'确认选图，进入下一步',exact:true}).click();
 await page.locator('#batch-architecture-select').selectOption('recipe_phone_comms_master');
 await page.getByRole('button',{name:'确认架构，开始分析',exact:true}).click();
 await page.getByText(/1 款商品未通过分析检查/).waitFor();
 assert.equal(analyzeCount(),0); assert.equal(generateCount(),0);
 await page.getByRole('button',{name:'工坊生产预设',exact:true}).click();
 await outfitSelect.selectOption('auto');
 failAssets=true;
 await page.getByRole('button',{name:'重新加载资产',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'模拟资产服务暂时不可用'}).waitFor();
 assert.ok(!(await body()).includes('可用母本 0'));
 failAssets=false; outfits=outfits.map(row=>row.id==='sleeve'?{...row,registry:{status:'disabled'}}:row);
 await page.getByRole('button',{name:'重新加载资产',exact:true}).click();
 await page.getByText(/可用母本 1.*穿搭 0/).waitFor();
 assert.ok(!(await outfitSelect.innerText()).includes('局部深色袖口'));
 outfits=outfits.map(row=>row.id==='sleeve'?{...row,registry:{status:'published'}}:row);
 await page.getByRole('button',{name:'重新加载资产',exact:true}).click();
 await page.getByText(/可用母本 1.*穿搭 1/).waitFor();
 // Reload only after the asynchronous save is confirmed, not before its debounce.
 await page.getByRole('status').filter({hasText:'当前批次已保存'}).waitFor();
 assert.equal(batch.snapshot.settings.lockedOutfitId,'auto');
 await page.getByRole('button',{name:'管理资产库',exact:true}).click();
 await page.getByRole('button',{name:'返回当前创作',exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('tab'),'prompt_assets');
 assert.equal(new URL(page.url()).searchParams.has('step'),false);
 await page.getByRole('button',{name:'穿搭',exact:true}).click();
 await page.getByText('局部深色袖口',{exact:true}).first().waitFor();
 assert.ok(!(await body()).includes('无人像穿搭'));
 assert.equal(await page.getByRole('button',{name:'暂不可用于生产',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'暂不可用于生产',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'锁定穿搭',exact:true}).isEnabled(),true);
 await page.screenshot({path:join(evidence,'asset-library.png'),fullPage:true});
 await page.reload();
 await page.getByRole('button',{name:'返回当前创作',exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('tab'),'prompt_assets');
 await page.getByRole('button',{name:'返回当前创作',exact:true}).click();
 // Snapshot restore keeps the same batch; use the regular selection/analysis route.
 await page.getByRole('button',{name:/选图与配置/}).click();
 await page.getByRole('button',{name:'确认选图，进入下一步',exact:true}).click();
 await page.locator('#batch-architecture-select').selectOption('recipe_phone_comms_master');
 await page.getByRole('button',{name:'确认架构，开始分析',exact:true}).click();
 await page.getByRole('button',{name:/确认提示词，启动批量生图/}).waitFor();
 assert.equal(analyzeCount(),1); assert.equal(generateCount(),0);
 await page.screenshot({path:join(evidence,'storyboard-review.png'),fullPage:true});
 await page.getByRole('button',{name:/确认提示词，启动批量生图/}).click();
 await page.getByRole('button',{name:'采用',exact:true}).first().waitFor();
 assert.equal(generateCount(),4);
 await page.screenshot({path:join(evidence,'generated-delivery.png'),fullPage:true});
 await page.setViewportSize({width:900,height:1000});
 await page.getByRole('button',{name:'工坊生产预设',exact:true}).click();
 await page.getByRole('dialog',{name:'生产设置'}).waitFor();
 assert.equal(await page.getByRole('dialog',{name:'生产设置'}).evaluate(el=>el.parentElement.parentElement===document.body),true);
 await page.screenshot({path:join(evidence,'settings-900.png'),fullPage:true});
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog',{name:'生产设置'}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: eligibility consistency, lock preflight, load errors, live refresh, resource routes, analysis review and four-image delivery');
 console.log(`Evidence: ${evidence}`);
} catch(error) { console.error((await body()).slice(-10000)); await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}); console.error(`Evidence: ${evidence}`); throw error; }
finally { await browser.close(); }
