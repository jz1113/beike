import { useState } from 'react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { useCanvasHydrated } from '@client/features/canvas/hooks/useCanvasHydrated';
import type { SalesAssetSection, SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';
import type { LibraryMedia } from './mediaIndex';
import MediaLibrary from './MediaLibrary';
import { addLibraryReference } from './homeReference';

const salesFolders: Record<SalesAssetSection, string> = { script:'动作', persona:'人物', scene:'场景', sound:'声音' };

export default function ProjectMediaLibrary({onOpenProject, onOpenHome, visit, onReturn, onSelectSales}: {
  onOpenHome:()=>void;
  onOpenProject:(id:string,item:LibraryMedia)=>void;
  visit:{ section?:SalesAssetSection } | null;
  onReturn:()=>void;
  onSelectSales:(choice:SalesLibraryChoice)=>void;
}) {
  const [item,setItem]=useState<LibraryMedia|null>(null);
  const projectDialog = useModalDialog(Boolean(item), () => setItem(null));
  const projects=useCanvasStore(s=>s.projects);
  const hydrated=useCanvasHydrated();
  function open(id:string) {
    if(!item)return;
    onOpenProject(id,item);
    setItem(null);
  }
  return <>
    <MediaLibrary onInsert={setItem} visit={visit} initialFolder={visit?.section ? salesFolders[visit.section] : ''}
      onUseReference={media=>{addLibraryReference(media);onOpenHome();}}
      productionTools onReturn={visit ? onReturn : undefined} onSelectSales={onSelectSales}/>
    {item && <div className="bml-modal">
      <div ref={projectDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="选择目标画布" className="bml-project-picker">
        <h3>将「{item.name}」放入画布</h3>
        <button disabled={!hydrated} onClick={()=>open(useCanvasStore.getState().createProject().id)}>＋ 新建画布项目</button>
        {projects.filter(p=>p.studioScene || !p.nodes.length).map(p=><button key={p.id} onClick={()=>open(p.id)}>{p.title}</button>)}
        <button onClick={()=>setItem(null)}>取消</button>
      </div>
    </div>}
  </>;
}
