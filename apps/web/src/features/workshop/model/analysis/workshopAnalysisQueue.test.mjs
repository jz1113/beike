import test from 'node:test';
import assert from 'node:assert/strict';
import { runBatchVisionAnalyze } from './batchVisionAnalyzeQueue.ts';
import { startAutoPilotPipeline } from './batchAutoPilot.ts';

test('analysis queue clamps invalid concurrency and honors cancellation', async () => {
  let finished = 0;
  const options = {items:[{id:'a'},{id:'b'}],isAborted:()=>false,analyzeOne:async()=>true,onItemStart:()=>{},onItemFinish:()=>finished++,onItemError:()=>{}};
  assert.equal(await runBatchVisionAnalyze({...options, concurrency:-4}),2);
  assert.equal(finished,2);
  assert.equal(await runBatchVisionAnalyze({...options, concurrency:100, isAborted:()=>true}),0);
});
test('analysis queue caps simultaneous calls at six', async () => {
  let current=0, peak=0;
  const result=await runBatchVisionAnalyze({items:Array.from({length:15},(_,id)=>({id})),concurrency:100,isAborted:()=>false,
    analyzeOne:async()=>{current++;peak=Math.max(peak,current);await new Promise(resolve=>setTimeout(resolve,2));current--;return true;},onItemStart:()=>{},onItemFinish:()=>{},onItemError:()=>{}});
  assert.equal(result,15);assert.equal(peak,6);
});
test('assisted workflow only auto-selects active successful products and stops at review', async () => {
  let items=[{id:'active',selected:true,status:'success',selectedProductImages:[],allTypedImages:[{url:'first.jpg'}]},
    {id:'unselected',selected:false,status:'success',selectedProductImages:[],allTypedImages:[{url:'skip.jpg'}]},
    {id:'failed',selected:true,status:'failed',selectedProductImages:[],allTypedImages:[{url:'bad.jpg'}]}];
  const stages=[], toasts=[];
  await startAutoPilotPipeline({successfulItems:[items[0]],getItems:()=>items,setItems:update=>{items=update(items);},
    startBatchVisionAnalyze:async()=>{assert.deepEqual(items[0].selectedProductImages,['first.jpg']);items[0]={...items[0],analyzedSuccess:true,prompts:[{prompt:'four shots'}]};return 1;},
    setCurrentStage:stage=>stages.push(stage),showToast:message=>toasts.push(message),setIsAutoPilotRunning:()=>{}});
  assert.deepEqual(items[1].selectedProductImages,[]);assert.deepEqual(items[2].selectedProductImages,[]);
  assert.deepEqual(stages,[3]);assert.ok(toasts.some(message=>message.includes('不会自动生图')));
});
