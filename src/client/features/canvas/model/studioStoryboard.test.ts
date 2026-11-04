import { expect, it } from 'vitest';
import { studioStoryboardNodes } from './studioStoryboard';
import type { StudioScene } from './types';

it('识别导入的音视频和当前选中的出图，保留镜头描述与时长', () => {
  const scene: StudioScene = {connections: [], groups: [], strokes: [], textBoxes: [], view: {x: 0, y: 0, zoom: 1}, nodes: [
    {id:'voice', type:'input-image', previewType:'audio', content:'/storage/speech'},
    {id:'audio', type:'preview', content:'/storage/sound.mp3'},
    {id:'clip', type:'preview', previewType:'video', content:'/storage/clip', prompt:'向右摇镜', settings:{duration:'8s'}},
    {id:'photo', type:'gen-image', settings:{selectedImageIndex:1,generatedImages:[{fullUrl:'/storage/old.png'},{fullUrl:'/storage/new.png'}]}},
  ]};
  expect(studioStoryboardNodes(scene)).toMatchObject([
    {id:'clip', type:'video', videoUrl:'/storage/clip', textPrompt:'向右摇镜', shotDuration:8},
    {id:'photo', type:'image', imageUrl:'/storage/new.png'},
  ]);
});
