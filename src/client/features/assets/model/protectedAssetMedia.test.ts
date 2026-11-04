import { afterEach, expect, it, vi } from 'vitest';
import { collectProtectedAssetMedia } from './protectedAssetMedia';
import type { CustomAssetItem } from './customAssetStore';

afterEach(() => vi.unstubAllGlobals());

it('protects collected files, canvas references and old generated versions when deleting history', () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example' } });
  const project = { id:'canvas', title:'项目', createdAt:1, updatedAt:1,
    nodes:[{id:'node', type:'image', imageUrl:'/storage/result.png', drawing:{references:['/storage/ref.png']}}],
    studioScene:{nodes:[{content:'https://app.example/storage/current.mp4', settings:{generationVersions:[
      {content:'/storage/first.mp4', generatedImages:[{fullUrl:'/storage/old.png'}]},
    ]}}]},
  };
  const assets = [{mediaUrl:'/storage/import.mp4', coverUrl:'/storage/cover.png'},
    {mediaUrl:'/storage/result.png'}, {mediaUrl:'blob:temporary', coverUrl:'data:image/png;base64,AA=='}] as CustomAssetItem[];
  expect(collectProtectedAssetMedia([project], assets)).toEqual([
    '/storage/result.png','/storage/ref.png','/storage/current.mp4','/storage/first.mp4','/storage/old.png',
    '/storage/import.mp4','/storage/cover.png',
  ]);
});
