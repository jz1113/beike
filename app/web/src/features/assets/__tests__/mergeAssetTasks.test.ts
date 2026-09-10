import { expect, it, vi } from 'vitest';
vi.mock('@/store/persist/generation',()=>({isGenerationDeleted:()=>false}));
import { mergeAssetTasks } from '../mergeAssetTasks';
it('uses persisted success in preference to stale in-progress memory and keeps one result', () => {
  const task={id:'one',taskId:'upstream',status:'IN_PROGRESS' as const,prompt:'p',model:'gpt-image-2',createdAt:new Date().toISOString()};
  const result=mergeAssetTasks({dbTasks:[{...task,status:'SUCCESS',resultUrl:'/a.png'}],generationTasks:[task],sessions:[],canvasTasks:[],mediaCategory:'image',searchKeyword:'',timeFilter:'all'});
  expect(result).toHaveLength(1); expect(result[0]).toMatchObject({status:'SUCCESS',resultUrl:'/a.png'});
});
it('canvas selection filters without mutating input order', () => {
  const canvasTasks=[{id:'a',title:'match',createdAt:'2026-01-01'},{id:'b',title:'other',createdAt:'2026-02-01'}];
  const result=mergeAssetTasks({dbTasks:[],generationTasks:[],sessions:[],canvasTasks,mediaCategory:'canvas',searchKeyword:'match',timeFilter:'all'});
  expect(result.map(task=>task.id)).toEqual(['a']); expect(canvasTasks.map(task=>task.id)).toEqual(['a','b']);
});
