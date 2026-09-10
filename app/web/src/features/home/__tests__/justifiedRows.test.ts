import {expect,it} from 'vitest';
import {justifiedRows} from '../utils/justifiedRows';
it('fills each row with mixed portrait and landscape media without gaps or omissions',()=>{
 const ratios=[.5625,16/9,16/9,.75,.75,16/9,.5625,.75,.75,.75,.75,.75,.75];
 for(const width of [360,768,1280]){
  const rows=justifiedRows(ratios,width);
  expect(rows.flat()).toEqual(ratios.map((_,index)=>index));
  for(const row of rows){
   const height=(width-4*(row.length-1))/row.reduce((sum,index)=>sum+ratios[index],0);
   expect(height).toBeGreaterThan(0);
   expect(row.reduce((sum,index)=>sum+ratios[index]*height,0)+4*(row.length-1)).toBeCloseTo(width);
  }
 }
});
