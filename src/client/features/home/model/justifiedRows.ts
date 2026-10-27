/** Partition the feed into complete rows with a shared height and original media ratios. */
export function justifiedRows(ratios:number[],width:number,gap=4):number[][] {
  if(!ratios.length || !Number.isFinite(width) || width <= 0)return [];
  const target=Math.min(300,Math.max(150,width/4));
  const costs=Array(ratios.length+1).fill(Infinity),next=Array(ratios.length).fill(0);costs[ratios.length]=0;
  for(let start=ratios.length-1;start>=0;start--){
    let sum=0;
    for(let end=start;end<Math.min(ratios.length,start+9);end++){
      sum+=ratios[end];const height=(width-gap*(end-start))/sum;
      if(height<=0)break;
      const cost=(height-target)**2+costs[end+1];
      if(cost<costs[start]){costs[start]=cost;next[start]=end+1;}
    }
  }
  const rows:number[][]=[];
  for(let start=0;start<ratios.length;){const end=next[start] || start+1;rows.push(Array.from({length:end-start},(_,i)=>start+i));start=end;}
  return rows;
}

/** Paginate complete rows from one layout, so loading more never regroups existing cards. */
export function visibleJustifiedRows(ratios: number[], width: number, visibleCount: number, gap = 4): number[][] {
  return justifiedRows(ratios, width, gap).filter(row => row[0] < visibleCount);
}
