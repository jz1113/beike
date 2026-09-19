import { test, expect, vi } from 'vitest';
const db=vi.hoisted(()=>({upsert:vi.fn()}));
vi.mock('@beike/server-kit/prisma',()=>({prisma:{assistantTurnItem:{upsert:db.upsert}}}));
import {enqueueItemPersist,flushItemQueue} from './itemPersistQueue';
const item=(status:string)=>({id:'audit-item',kind:'toolCall',name:'mock',status,createdAt:Date.now(),args:'{}'} as any);
test('flush waits for an earlier drain',async()=>{
 let release!:()=>void;let written=false;db.upsert.mockImplementationOnce(()=>new Promise<void>(r=>{release=()=>{written=true;r()}}));
 enqueueItemPersist('turn',item('done')); const first=flushItemQueue();
 let finished=false; const second=flushItemQueue().then(()=>{finished=true});
 await Promise.resolve();expect(finished).toBe(false);expect(written).toBe(false);release();await Promise.all([first,second]);expect(written).toBe(true);
});
test('retry cannot overwrite a newer done state',async()=>{
 const writes:string[]=[];let reject!:(e:Error)=>void;
 db.upsert.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r})).mockImplementation(async(q:any)=>{writes.push(q.update.status)});
 enqueueItemPersist('turn',item('running'));const draining=flushItemQueue();
 enqueueItemPersist('turn',item('done'));reject(new Error('temporary DB busy'));
 await draining;expect(writes).toEqual(['done']);
});

test('keeps a failed write available for a later flush', async () => {
  db.upsert.mockRejectedValue(new Error('disk unavailable'));
  enqueueItemPersist('turn', item('done'));
  await expect(flushItemQueue()).rejects.toThrow('disk unavailable');
  db.upsert.mockResolvedValue({});
  await flushItemQueue();
  expect(db.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    update: expect.objectContaining({ status: 'done' }),
  }));
});
