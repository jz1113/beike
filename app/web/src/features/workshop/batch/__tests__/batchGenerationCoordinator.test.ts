import { beforeEach, expect, it, vi } from 'vitest';
import { startBatchGenerationCoordinator, retrySingleShotTaskCoordinator, retryFailedImageTasksCoordinator, type BatchCoordinatorDeps } from '../batchGenerationCoordinator';
import { executeSingleImageTask, generateItemViaGrid } from '../batchTaskExecution';
import type { BatchProductItem } from '../batchTypes';
vi.mock('../batchTaskExecution', () => ({executeSingleImageTask:vi.fn(async () => 'result'),generateItemViaGrid:vi.fn(async (_a,_b,_c,_d,bump) => bump(true,4))}));
beforeEach(() => vi.clearAllMocks());
function setup(count: number, unchecked = -1) {
  let items = [{id:'phone',title:'手机',status:'success',selected:true,analyzedSuccess:true,selectedProductImages:['product'],
    prompts:Array.from({length:count},(_,i)=>({shot_no:i+1,title:`动作${i}`,prompt:`人工确认的独立动作 ${i}`,action:`动作${i}`,has_human:false,selected:i!==unchecked})),
    tasks:Array.from({length:4},(_,i)=>({id:String(i),status:'SUCCESS',resultUrl:'old'})),
  }] as BatchProductItem[];
  const deps = {config:{batchMode:'original',hasHumanPersona:false,selectedShotCount:count,selectedQuality:'high',selectedAspect:'3:4',selectedImageGenModel:'model',isAborted:()=>false},generationStrategy:'grid_first',imageGenConcurrency:1,
    itemsRef:{current:items},setItems:(update:any)=>{items=typeof update==='function'?update(items):update;},isAbortedRef:{current:false},showToast:vi.fn(),setCurrentStage:vi.fn(),setIsGeneratingBatch:vi.fn(),setTotalTaskCount:vi.fn(),setCompletedTaskCount:vi.fn(),setSuccessTaskCount:vi.fn(),setFailTaskCount:vi.fn(),generateAllCopywriting:vi.fn(async()=>{}),
  } as unknown as BatchCoordinatorDeps;
  return {deps,getItems:()=>items};
}
it('one-shot setting submits one exact prompt even when grid is preferred, replacing prior successful tasks',async()=>{
  const {deps,getItems}=setup(1);
  await startBatchGenerationCoordinator(deps);
  expect(generateItemViaGrid).not.toHaveBeenCalled();
  expect(executeSingleImageTask).toHaveBeenCalledTimes(1);
  expect(vi.mocked(executeSingleImageTask).mock.calls[0][1].prompt).toBe('人工确认的独立动作 0');
  expect(getItems()[0].tasks).toHaveLength(1);
  expect(getItems()[0].tasks[0].resultUrl).toBe('result');
  expect(deps.setTotalTaskCount).toHaveBeenCalledWith(1);
  expect(deps.generateAllCopywriting).toHaveBeenCalledTimes(1);
});
it('excludes unchecked shots consistently in task titles, counts and actual requests',async()=>{
  const {deps,getItems}=setup(4,1);
  await startBatchGenerationCoordinator(deps);
  expect(generateItemViaGrid).not.toHaveBeenCalled();
  expect(vi.mocked(executeSingleImageTask).mock.calls.map(call=>call[1].shot_no)).toEqual([1,3,4]);
  expect(getItems()[0].tasks.map(t=>t.shot_no)).toEqual([1,3,4]);
  expect(deps.setTotalTaskCount).toHaveBeenCalledWith(3);
});
it('uses grid only for four confirmed shots',async()=>{
  const {deps}=setup(4);
  await startBatchGenerationCoordinator(deps);
  expect(generateItemViaGrid).toHaveBeenCalledTimes(1);
  expect(executeSingleImageTask).not.toHaveBeenCalled();
});

it('stopping generation skips copywriting and reports stopped instead of complete', async () => {
  const { deps } = setup(4);
  vi.mocked(generateItemViaGrid).mockImplementationOnce(async () => {
    deps.isAbortedRef.current = true;
  });
  await startBatchGenerationCoordinator(deps);
  expect(deps.generateAllCopywriting).not.toHaveBeenCalled();
  expect(deps.setIsGeneratingBatch).toHaveBeenLastCalledWith(false);
  expect(deps.showToast).toHaveBeenLastCalledWith(expect.stringContaining('已停止'));
});

it('prevents duplicate batch submissions before the UI updates', async () => {
  const { deps } = setup(4);
  let release!: () => void;
  vi.mocked(generateItemViaGrid).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = startBatchGenerationCoordinator(deps);
  await startBatchGenerationCoordinator(deps);
  expect(generateItemViaGrid).toHaveBeenCalledTimes(1);
  release(); await first;
});
it('clears generating state after unexpected worker errors', async () => {
  const { deps } = setup(4);
  vi.mocked(generateItemViaGrid).mockRejectedValueOnce(new Error('slice failure'));
  await startBatchGenerationCoordinator(deps);
  expect(deps.setIsGeneratingBatch).toHaveBeenLastCalledWith(false);
  expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('队列异常'));
});

it('retries the task shot number even after the prompt order or selection changes', async () => {
  const { deps, getItems } = setup(4);
  const item = deps.itemsRef.current[0];
  item.tasks = [{ id: 'fourth', shot_no: 4, title: 'four', prompt: 'old', status: 'FAILURE' }];
  item.prompts[3].selected = false;
  await retrySingleShotTaskCoordinator(item.id, 0, [item], deps.setItems, deps.config, deps.showToast);
  expect(vi.mocked(executeSingleImageTask).mock.calls[0][1].shot_no).toBe(4);
  expect(getItems()[0].tasks[0].resultUrl).toBe('result');
});
it('batch retry preserves shot identity when an earlier shot was unchecked', async () => {
  const { deps } = setup(4);
  const item = deps.itemsRef.current[0];
  item.tasks = [{ id: 'three', shot_no: 3, title: 'three', prompt: 'old', status: 'FAILURE' }];
  item.prompts[0].selected = false;
  await retryFailedImageTasksCoordinator(deps, [item], false);
  expect(vi.mocked(executeSingleImageTask).mock.calls[0][1].shot_no).toBe(3);
});
it('does not substitute another shot when the original prompt was removed', async () => {
  const { deps } = setup(1);
  const item = deps.itemsRef.current[0];
  item.tasks = [{ id: 'lost', shot_no: 4, title: 'four', prompt: 'old', status: 'FAILURE' }];
  await retrySingleShotTaskCoordinator(item.id, 0, [item], deps.setItems, deps.config, deps.showToast);
  expect(executeSingleImageTask).not.toHaveBeenCalled();
  expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('已不存在'));
});

it('blocks all generation entry points for recovered unverified tasks', async () => {
  const { deps, getItems } = setup(4);
  deps.setItems(items => items.map(item => ({ ...item, tasks: [{ id: 'old', shot_no: 1, title: 'old', prompt: 'p', status: 'FAILURE', recoveryRequired: true }] })));
  deps.itemsRef.current = getItems();
  await startBatchGenerationCoordinator(deps);
  await retryFailedImageTasksCoordinator(deps, getItems(), false);
  expect(generateItemViaGrid).not.toHaveBeenCalled();
  expect(executeSingleImageTask).not.toHaveBeenCalled();
  expect(getItems()[0].tasks[0].recoveryRequired).toBe(true);
});
