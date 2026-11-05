import type { StudioScene } from './types';

type SceneUpdate = {kind:'studio:save';scene:StudioScene} | {kind:'studio:view';view:StudioScene['view']};
const contentKeys = ['nodes','connections','groups','textBoxes','strokes'] as const;
/** Keep interaction updates local; clone only the latest graph at a bounded cadence. */
export function createStudioScenePublisher(send:(update:SceneUpdate)=>void) {
  let previous:StudioScene|undefined;
  let pending:StudioScene|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const flush=()=>{
    clearTimeout(timer);timer=undefined;
    const scene=pending;pending=undefined;
    if(!scene)return;
    if(!previous || contentKeys.some(key=>scene[key]!==previous![key]))send({kind:'studio:save',scene});
    else if(scene.view.x!==previous.view.x || scene.view.y!==previous.view.y || scene.view.zoom!==previous.view.zoom)send({kind:'studio:view',view:scene.view});
    previous={...scene,view:{...scene.view}};
  };
  return {flush,queue(scene:StudioScene){
    pending=scene;
    if(!previous)flush();
    else timer??=setTimeout(flush,160);
  }};
}
