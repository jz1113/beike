vi.mock('@beike/server-kit/prisma', async () => {
  const { isolatedDatabase } = await import('../../../../../../works/test-support/isolated-database');
  const database = isolatedDatabase();
  return { prisma: database.prisma, testDatabase: database };
});
import {test,expect,vi,beforeAll,afterAll} from 'vitest';
vi.mock('@beike/server-kit/storage',()=>({deleteObjectsFromStorage:vi.fn(async()=>{})}));
import {prisma} from '@beike/server-kit/prisma';
const { testDatabase } = await import('@beike/server-kit/prisma') as unknown as {
  testDatabase: ReturnType<typeof import('../../../../../../works/test-support/isolated-database').isolatedDatabase>;
};
beforeAll(async () => { await testDatabase.initialize(); });
afterAll(async () => { await testDatabase.dispose(); });
import {DELETE} from '../tasks';
test('clearFailed preserves cloud tasks still in progress',async()=>{
 await prisma.imageTask.create({data:{id:'active-audit',taskId:'cloud-still-working',prompt:'audit',status:'IN_PROGRESS'}});
 const response=await DELETE(new Request('http://localhost/api/assets/tasks?clearFailed=true',{method:'DELETE'}));
 expect(response.status).toBe(200);expect(await prisma.imageTask.findUnique({where:{id:'active-audit'}})).not.toBeNull();
});
