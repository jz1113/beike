import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Trash2, MoreHorizontal, Pencil, FolderInput } from 'lucide-react';
import { createMediaFolder, deleteMediaFolder, relocateMediaFolder } from '@client/features/assets/model/customAssetStore';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { indexMediaFolders } from './mediaFolders';

export function MediaFolderSidebar({id,expanded,folder,folders,saved,count,onSelect,onNotice,onRoleResources}:{
  id:string; expanded:boolean; folder:string; folders:ReturnType<typeof indexMediaFolders>;
  saved:string[]; count:number; onSelect:(path:string)=>void; onNotice:(message:string)=>void; onRoleResources?:()=>void;
}) {
  const [action,setAction] = useState<{path:string; mode:'menu'|'rename'|'move'}|null>(null);
  const [destination,setDestination] = useState('');
  const [parent,setParent] = useState<string|null>(null);
  const [name,setName] = useState('');
  const [error,setError] = useState('');
  function edit(path:string, mode:'menu'|'rename'|'move') {
    setParent(null); setError(''); setName(path.split('/').at(-1) || '');
    setDestination(path.split('/').slice(0,-1).join('/'));
    setAction({path,mode}); onSelect(path);
  }
  function start(path:string) {
    setAction(null);
    onSelect(path);
    setParent(path);
    setName('');
    setError('');
  }
  async function remove(path:string) {
    if (!await confirmAction({title:'删除「'+path+'」？',description:'将删除此分类、它的子分类及其中的收藏关系。原始素材仍然保留。',confirmText:'删除',danger:true})) return;
    try { deleteMediaFolder(path); setAction(null); onNotice('已删除「'+path+'」'); }
    catch (cause) { onNotice(cause instanceof Error ? cause.message : '删除失败'); }
  }
  function form(path:string) {
    if (parent !== path) return null;
    const target = path || '我的文件夹';
    return <form className="bml-folder-form" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setParent(null);}}}
      onSubmit={e=>{e.preventDefault();try {
        const created = createMediaFolder(name,target,folders.map(node=>node.path));
        setParent(null); onSelect(created); onNotice('已创建「'+created+'」');
      } catch(cause) {setError(cause instanceof Error ? cause.message : '创建失败');}}}>
      <label>在「{target}」下新建<input autoFocus aria-label="新分类名称" maxLength={60} placeholder="分类名称"
        value={name} onChange={e=>{setName(e.target.value);setError('');}}/></label>
      {error && <small role="alert">{error}</small>}
      <div><button type="submit" disabled={!name.trim()}>创建</button><button type="button" onClick={()=>setParent(null)}>取消</button></div>
    </form>;
  }
  function actions(path:string) {
    if (action?.path !== path) return null;
    if (action.mode === 'menu') return <div className="bml-folder-actions" aria-label={path+'的操作'}>
      <button onClick={()=>edit(path,'rename')}><Pencil size={13}/>重命名</button>
      <button onClick={()=>edit(path,'move')}><FolderInput size={13}/>移动到…</button>
      <button className="bml-folder-danger" onClick={()=>void remove(path)}><Trash2 size={13}/>删除分类</button>
    </div>;
    const moving = action.mode === 'move';
    const targets = [...new Set(['我的文件夹', ...folders.map(node=>node.path)])]
      .filter(target=>target !== path && !target.startsWith(path+'/'));
    return <form className="bml-folder-form" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setAction(null);}}}
      onSubmit={e=>{e.preventDefault();try {
        const target = relocateMediaFolder(path,name,destination,folders.map(node=>node.path));
        setAction(null); onSelect(target); onNotice(moving ? '已移动到「'+target+'」' : '已重命名为「'+target+'」');
      } catch(cause) {setError(cause instanceof Error ? cause.message : '保存失败');}}}>
      {moving ? <label>移动「{name}」到<select autoFocus aria-label="移动目标文件夹" value={destination} onChange={e=>{setDestination(e.target.value);setError('');}}>
        {targets.map(target=><option key={target} value={target}>{target}</option>)}
      </select></label> : <label>重命名分类<input autoFocus aria-label="分类新名称" maxLength={60} value={name}
        onChange={e=>{setName(e.target.value);setError('');}}/></label>}
      {error && <small role="alert">{error}</small>}
      <div><button type="submit" disabled={!name.trim()}>{moving ? '移动' : '保存'}</button>
        <button type="button" onClick={()=>setAction(null)}>取消</button></div>
    </form>;
  }
  function select(path:string) { setParent(null); setAction(null); onSelect(path); }
  return <aside id={id} aria-label="素材文件夹" data-expanded={expanded}>
    <button aria-pressed={!folder} onClick={()=>select('')}><FolderOpen size={15}/>全部文件夹<span className="bml-folder-count">{count}</span></button>
    <button title={'在「'+(folder || '我的文件夹')+'」下创建'} onClick={()=>start(folder)}>＋ {folder ? '新建子分类' : '新建文件夹'}</button>{form('')}
    {onRoleResources && <button onClick={onRoleResources}>角色资源库</button>}
    {folders.filter(node=>!node.parent || folder===node.parent || folder.startsWith(node.parent+'/')).map(({path,count,hasChildren})=>{
      const open = folder===path || folder.startsWith(path+'/');
      const Arrow = open ? ChevronDown : ChevronRight;
      return <Fragment key={path}><div className="bml-folder-row">
        <button title={path} aria-pressed={folder===path} aria-expanded={hasChildren ? open : undefined}
          style={{paddingLeft:10+Math.min(4,path.split('/').length-1)*12}}
          onClick={()=>select(hasChildren && folder===path ? path.split('/').slice(0,-1).join('/') : path)}>
          <Folder size={13}/><span className="bml-folder-name">{path.split('/').at(-1)}</span><span className="bml-folder-count">{count}</span>{hasChildren && <Arrow size={12}/>}
        </button>
        <button className="bml-add-folder" title={'在「'+path+'」下新建子分类'} aria-label={'在「'+path+'」下新建子分类'} onClick={()=>start(path)}><Plus size={14}/></button>
        {saved.includes(path) && <button className="bml-folder-more" title={'管理「'+path+'」'} aria-label={'管理「'+path+'」'}
          aria-expanded={action?.path===path} onClick={()=>action?.path===path ? setAction(null) : edit(path,'menu')}><MoreHorizontal size={14}/></button>}
      </div>{form(path)}{actions(path)}</Fragment>;
    })}
  </aside>;
}
