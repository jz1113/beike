import { FolderOpen } from 'lucide-react';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesWorkspaceNavigation({disabled,onOpen}:{disabled?:boolean;onOpen:()=>void}) {
  return <button type="button" disabled={disabled} className={`${salesGhostButtonClass} ${salesFocusClass}`} onClick={onOpen}>
    <FolderOpen size={15} aria-hidden/>打开资产库
  </button>;
}
