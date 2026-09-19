vi.mock('@beike/server-kit/prisma', async () => {
  const { isolatedDatabase } = await import('../../../../../../works/test-support/isolated-database');
  const database = isolatedDatabase();
  return { prisma: database.prisma, testDatabase: database };
});
import {test,expect,vi,beforeAll,afterAll} from 'vitest';
vi.mock('@beike/server-kit/storage',()=>({resolveStorageConfig:()=>({publicDomain:'https://permanent.invalid'}),isAlreadyPermanentUrl:(url:string)=>url.startsWith('https://permanent.invalid'),uploadRemoteMediaToStorage:vi.fn(async()=> 'https://permanent.invalid/new')}));
import {prisma} from '@beike/server-kit/prisma';
const { testDatabase } = await import('@beike/server-kit/prisma') as unknown as {
  testDatabase: ReturnType<typeof import('../../../../../../works/test-support/isolated-database').isolatedDatabase>;
};
beforeAll(async () => { await testDatabase.initialize(); });
afterAll(async () => { await testDatabase.dispose(); });
import {POST} from '../storage/migrate';
test('migration cursor reaches all records beyond the first batch',async()=>{
 await prisma.$transaction(Array.from({length:101},(_,i)=>prisma.imageTask.create({data:{id:'migration-'+String(i).padStart(3,'0'),prompt:'audit',status:'SUCCESS',resultUrl:i===100?'https://temporary.invalid/old':'https://permanent.invalid/'+i,createdAt:new Date(100000+i)}})));
 let cursor: string | undefined;
 let migrated = 0;
 for(let i=0;i<2;i++) {
   const res=await POST(new Request('http://localhost/api/assets/storage/migrate',{method:'POST',body:JSON.stringify({limit:100,cursor})}));
   const body=await res.json(); migrated += body.migrated;
   expect(body.hasMore).toBe(i === 0); cursor=body.nextCursor;
 }
 expect(migrated).toBe(1);
 expect((await prisma.imageTask.findUnique({where:{id:'migration-100'}}))?.resultUrl).toBe('https://permanent.invalid/new');
});
