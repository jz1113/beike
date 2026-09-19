import type {CanvasNode} from './types';
export function drawingGeometry(node:CanvasNode) {
 const [w,h]=(node.drawing?.aspect || (node.generationKind === 'video' ? '16:9' : '1:1')).split(':').map(Number);
 const ratio=(node.imageUrl || node.videoUrl) && node.resultWidth && node.resultHeight ? node.resultWidth/node.resultHeight : (w>0 && h>0?w/h:1);
 return {width:280,height:280/ratio};
}
