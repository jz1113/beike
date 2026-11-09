import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { StoredSalesScript } from '@client/features/sales/api/salesScripts';
import { classifyActionScript, indexLibrary } from './mediaIndex';
import { indexMediaFolders } from './mediaFolders';
import { replacementFields, replaceLibraryMedia, validateReplacementFile } from './mediaReplacement';
import type { CanvasProject } from '@client/features/canvas/model/types';
import { replaceCustomMediaFile } from '@client/features/assets/model/customAssetStore';
import { type CustomAssetItem } from '@client/shared/media/customAssetStorage';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { fetchAssetDetail } from '@client/shared/api/assetLibraryCache';
import { updateSalesMaterial, updateSalesSound } from '@client/features/sales/api/salesMaterials';

vi.mock('@client/shared/api/uploadStudioFile', () => ({ uploadStudioFile: vi.fn() }));
vi.mock('@client/shared/api/assetLibraryCache', () => ({ fetchAssetDetail: vi.fn(), invalidateGlobalAssetCache: vi.fn() }));
vi.mock('@client/features/sales/api/salesMaterials', () => ({ updateSalesMaterial: vi.fn(), updateSalesSound: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

const project: CanvasProject = {
  id: 'p', title: '项目一', subtitle: '', createdAt: 0, updatedAt: 0, nodes: [],
  studioScene: { connections: [], strokes: [], textBoxes: [], groups: [], view: { x: 0, y: 0, zoom: 1 }, nodes: [
    { id: 'voice', type: 'input-image', nodeName: '旁白', previewType: 'audio', content: '/storage/narration', settings: { mediaType: 'audio' } },
    { id: 'image', type: 'gen-image', nodeName: '场景', content: '/storage/scene.png', settings: { generatedImages: [{ fullUrl: '/storage/scene.png' }, { fullUrl: '/storage/alternate.png' }] } },
    { id: 'text', type: 'text-node', content: 'https://example.com/reference' },
  ] },
};
const local: CustomAssetItem = { id: 'l', name: '封面', category: 'file', folder: '我的文件夹/参考', mediaKind: 'image', mediaUrl: '/storage/scene.png', createdAt: 0, updatedAt: 0 };

describe('统一素材索引', () => {
  it('applies moved categories without creating extra cards or losing original sources', () => {
    const original = indexLibrary([local], [], [], null, null);
    const placement: CustomAssetItem = { id: 'placement', category: 'file', name: '封面', placementKey: 'image|' + local.mediaUrl,
      placementFolders: ['场景/室外'], createdAt: 0, updatedAt: 0 };
    const moved = indexLibrary([local, placement], [], [], null, null);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toEqual({ ...original[0], folders: ['场景/室外'], classificationMoved: true });
  });

  it('indexes each script once, including drafts and scripts without a playable video', () => {
    const source: StoredSalesScript = {
      id: 'dance', title: '蓝天屋顶上的全身舞蹈', status: 'verified', version: 1, useCount: 0, updatedAt: '',
      videoUrl: '/storage/dance.mp4', depthVideoUrl: '/storage/dance-depth.mp4', videoHash: '', model: '', promptVersion: '',
      script: normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '跳舞' }] }] })!,
    };
    const draft = { ...source, id: 'draft', status: 'draft' as const, depthVideoUrl: '', videoUrl: '/storage/draft.mp4' };
    const items = indexLibrary([], [], [], null, null, [source, draft]);
    expect(items).toHaveLength(2);
    expect(items.map(item => item.url)).toEqual(['dance', 'draft']);
    expect(items[0]).toMatchObject({ kind: 'script', folders: ['动作'],
      sources: [{ type: 'script', id: 'dance' }] });
    const ref = { ...local, mediaKind: undefined, mediaUrl: undefined, folder: '动作/舞蹈', scriptId: 'dance' };
    const collected = indexLibrary([ref], [], [], null, null, [source]);
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({ kind: 'script', folders: ['动作', '动作/舞蹈'], record: source });
    const placement: CustomAssetItem = { id: 'move-script', category: 'file', name: source.title,
      placementKey: 'script|dance', placementFolders: ['我的文件夹/动作参考'], createdAt: 0, updatedAt: 0 };
    const moved = indexLibrary([placement], [], [], null, null, [source]);
    expect(moved[0]).toMatchObject({ folders: ['我的文件夹/动作参考'], record: source });
  });
  it('不自动收录画布及其历史版本素材', () => {
    const nodes = [{ id: 'movie', type: 'gen-video', previewType: 'video', content: '/storage/new.mp4', settings: {
      generatedImages: [{ fullUrl: '/storage/new.mp4' }],
      generationVersions: [{ originalUrl: '/storage/old.mp4', mediaType: 'video' }, { originalUrl: '/storage/new.mp4', mediaType: 'video' }],
    } }];
    const items = indexLibrary([], [], [{ ...project, studioScene: { ...project.studioScene!, nodes } }], null, null);
    expect(items).toEqual([]);
  });

  it('excludes task references and generation results', () => {
    const items = indexLibrary([], [{
      id: 'task', title: '生成图片', prompt: '', model: '', size: '', quality: '', mediaType: 'image',
      status: 'SUCCESS', progress: '', useReferenceImage: true,
      resultUrl: '/storage/result.png', referenceImageUrl: '/storage/reference.png',
    }], [], null, null);
    expect(items).toEqual([]);
  });
  it('indexes shared scenes without adding outfit or prompt group covers and folders', () => {
    const scene = { id: 'scene', title: '室内场景', spatialType: 'indoor', coverUrl: '/storage/scene.png' };
    const items = indexLibrary([], [], [], null, {
      personas: [], outfits: [{ id: 'outfit', coverUrl: '/storage/outfit.png' }, { id: 'shared-cover', coverUrl: scene.coverUrl }], scenes: [scene], actions: [],
      fullPrompts: [{ id: 'prompt', coverUrl: '/storage/prompt.png' }, { id: 'overlap', coverUrl: scene.coverUrl }],
      productCategories: [], lastUpdated: 0, isLoaded: true,
    });
    expect(items.map(({ url, folders }) => ({ url, folders }))).toEqual([
      { url: scene.coverUrl, folders: ['场景/室内'] },
    ]);
  });
  it('groups overlapping scene records and older reference images under the classified scene', () => {
    const main = '/storage/main.jpg', right = '/storage/right.jpg', extra = '/storage/extra.jpg';
    const scene = { id: 'garden', title: '花园', coverUrl: main, spatialType: 'outdoor', tags: '', category: '', description: '',
      lighting: '', suitableCategories: [], source: 'scene_library', sourceImages: [right, extra, main],
      dimensions: JSON.stringify({ sceneViews: { main, right } }) };
    const items = indexLibrary([], [], [], { scenes: [scene], personas: [], actions: [], voices: [], bgms: [] }, {
      personas: [], outfits: [], scenes: [{ ...scene, coverUrl: right }], actions: [], fullPrompts: [], productCategories: [], lastUpdated: 0, isLoaded: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: main, folders: ['场景/室外'], views: [
      { label: '主图', url: main }, { label: '右侧视角', url: right }, { label: '参考图 1', url: extra },
    ] });
    const placement: CustomAssetItem = { id: 'move-scene', category: 'file', name: scene.title,
      placementKey: 'image|' + main, placementFolders: ['我的文件夹/参考'], createdAt: 0, updatedAt: 0 };
    const moved = indexLibrary([placement], [], [], { scenes: [scene], personas: [], actions: [], voices: [], bgms: [] }, null);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ folders: ['我的文件夹/参考'], views: items[0].views });
  });
  it('uses saved persona demographics when the shared cover has a generic title', () => {
    const cover = '/storage/person.png';
    const person = { id: 'p', name: '人物 1', tags: '', description: '', dimensions: JSON.stringify({ audience: 'adult_male', personaAge: 'middle' }),
      sourceImages: [cover], avatarUrl: cover, faceUrl: cover, fullBodyUrl: cover, hasReferenceImage: true, source: 'persona_library' };
    const items = indexLibrary([], [], [], { scenes: [], personas: [person], actions: [], voices: [], bgms: [] }, {
      personas: [{ id: 'p', title: '人物', coverUrl: cover }], outfits: [], scenes: [], actions: [], fullPrompts: [], productCategories: [], lastUpdated: 0, isLoaded: true,
    });
    expect(items.map(item => item.folders)).toEqual([['人物/男/中年']]);
    expect(items[0].sources).toEqual([{ type: 'persona', id: 'p', name: '人物 1', folder: '人物/男/中年' }]);
  });
  it('keeps collected media without adding project folders', () => {
    const items = indexLibrary([local], [], [project], null, null);
    expect(items.filter(i => i.url === '/storage/scene.png')).toHaveLength(1);
    expect(items.find(i => i.url === '/storage/scene.png')).toMatchObject({ folders: ['我的文件夹/参考'] });
  });
  it('keeps separate delete targets when a voice, a BGM and a local collection share audio', () => {
    const url = '/storage/sample.wav';
    const items = indexLibrary([{ ...local, mediaKind: 'audio', mediaUrl: url }], [], [], {
      personas: [], scenes: [], actions: [],
      voices: [{ id: 'v', name: '人声', sampleAudioUrl: url, gender: 'female', voiceId: '', ttsVoice: '', promptText: '', tags: [], source: 'voice_library' }],
      bgms: [{ id: 'b', title: 'BGM', audioUrl: url, source: 'custom_bgm', description: '', moodTags: [], bpm: 90, durationSec: 10, suitableCategories: [], license: '' }],
    }, null);
    expect(items).toHaveLength(1);
    expect(items[0].sources?.map(({ type, id, folder }) => [type, id, folder])).toEqual([
      ['local', 'l', '我的文件夹/参考'], ['sound', 'v', '声音/人声'], ['sound', 'b', '声音/BGM'],
    ]);
  });
  it('does not expose canvas media or text links in the library', () => {
    const items = indexLibrary([], [], [project], null, null);
    expect(items).toEqual([]);
  });
  it('classifies action scripts by depth availability and presentation style', () => {
    const dance: StoredSalesScript = {
      id: 'dance', title: '室内甜美手势舞与律动展示', status: 'verified', version: 1, useCount: 0, updatedAt: '',
      videoUrl: '/storage/dance.mp4', depthVideoUrl: '/storage/dance-depth.mp4', videoHash: '', model: '', promptVersion: '',
      script: normalizeScriptTemplate({ durationSec: 12, format: 'presenter', voiceMode: 'none', shots: [{ beats: [{ start: 0, end: 12, action: '手势舞' }] }] })!,
    };
    const speech: StoredSalesScript = {
      ...dance, id: 'speech', title: '冲锋衣多机位分步卖点口播', depthVideoUrl: '',
      script: normalizeScriptTemplate({ durationSec: 18, format: 'presenter', voiceMode: 'speech', shots: [{ beats: [{ start: 0, end: 18, action: '口播讲解' }] }] })!,
    };
    expect(classifyActionScript(dance)).toEqual({ depth: '深度视频', style: '律动展示' });
    expect(classifyActionScript(speech)).toEqual({ depth: '仅分镜', style: '口播讲解' });
  });
});

describe('media folders', () => {
  it('counts a card once per ancestor even when it belongs to two child folders', () => {
    const folders = indexMediaFolders([{ url: '/storage/1.png', kind: 'image', name: '场景', keywords: [],
      folders: ['场景/室内', '我的文件夹/A', '我的文件夹/B'] }], ['我的文件夹/空']);
    const counts = Object.fromEntries(folders.map(({ path, count }) => [path, count]));
    expect(counts).toMatchObject({ '场景': 1, '场景/室内': 1, '场景/室外': 0, '我的文件夹': 1, '我的文件夹/A': 1, '我的文件夹/B': 1, '我的文件夹/空': 0 });
  });

  it('shows nested custom categories directly after their parent, before the next built-in branch', () => {
    const paths = indexMediaFolders([], ['场景/室内/厨房', '场景/夜景', '动作/转场']).map(node => node.path);
    expect(paths.slice(0, 6)).toEqual(['场景', '场景/室内', '场景/室内/厨房', '场景/室外', '场景/夜景', '人物']);
    expect(paths).toContain('动作/转场');
  });
});

const old = '/storage/old.png', next = '/storage/new.png';
const source = { type: 'scene' as const, id: 'scene-1', name: '原名', folder: '场景/室外' };
const image = new File(['image'], 'new.png', { type: 'image/png' });

describe('media replacement', () => {
  it('replaces only the selected scene view and preserves all descriptive and classification fields', () => {
    const dimensions = { sceneViews: { main: old, right: '/right.png' }, spatialType: 'outdoor', description: old };
    const detail = { title: '原名', category: '室外', coverUrl: old, sourceImages: JSON.stringify([old, '/right.png']), dimensions: JSON.stringify(dimensions) };
    const patch = replacementFields('scene', detail, old, next);
    expect(patch).toEqual({ coverUrl: next, sourceImages: JSON.stringify([next, '/right.png']), dimensions: JSON.stringify({ ...dimensions, sceneViews: { main: next, right: '/right.png' } }) });
    expect(detail.coverUrl).toBe(old);
    expect(() => replacementFields('scene', detail, '/missing', next)).toThrow('素材已变化');
  });
  it('updates persona avatar and saved sheet without overwriting name or audience', () => {
    expect(replacementFields('persona', { name: '原名', avatarUrl: old, dimensions: JSON.stringify({ gender: 'female', personaViews: { sheet: old } }) }, old, next))
      .toEqual({ avatarUrl: next, dimensions: JSON.stringify({ gender: 'female', personaViews: { sheet: next } }) });
  });
  it('keeps local record identity, count, name and moved classification across repeated replacements', () => {
    const asset = { id: 'local-1', category: 'file', name: '原名', folder: '导入素材', mediaKind: 'image', mediaUrl: old, createdAt: 1, updatedAt: 1 };
    const placement = { id: 'move', category: 'file', name: '原名', placementKey: 'image|' + old, placementFolders: ['场景/室外'], createdAt: 1, updatedAt: 1 };
    localStorage.setItem('beike.custom_assets', JSON.stringify([asset, placement]));
    replaceCustomMediaFile(asset.id, old, next, 'image');
    replaceCustomMediaFile(asset.id, next, '/storage/third.png', 'image');
    const records = JSON.parse(localStorage.getItem('beike.custom_assets')!);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ ...asset, mediaUrl: '/storage/third.png', updatedAt: expect.any(Number) });
    expect(indexLibrary(records, [], [], null, null)).toEqual([expect.objectContaining({ name: '原名', url: '/storage/third.png', folders: ['场景/室外'], sources: [expect.objectContaining({ id: asset.id })] })]);
    const saved = localStorage.getItem('beike.custom_assets');
    expect(() => replaceCustomMediaFile(asset.id, old, next, 'image')).toThrow('素材已变化');
    expect(localStorage.getItem('beike.custom_assets')).toBe(saved);
  });
  it('uploads then patches the existing remote ID with media fields only', async () => {
    vi.mocked(fetchAssetDetail).mockResolvedValue({ id: source.id, coverUrl: old, title: '原名' });
    vi.mocked(uploadStudioFile).mockResolvedValue(next);
    await replaceLibraryMedia(source, 'image', old, image);
    expect(uploadStudioFile).toHaveBeenCalledWith(image, 'canvas-library');
    expect(updateSalesMaterial).toHaveBeenCalledExactlyOnceWith('scene', source.id, { coverUrl: next });
    expect(updateSalesSound).not.toHaveBeenCalled();
  });
  it('does not mutate records when validation or upload fails', async () => {
    expect(() => validateReplacementFile(new File(['x'], 'bad.mp4', { type: 'video/mp4' }), 'image')).toThrow('相同类型');
    expect(() => validateReplacementFile(new File([], 'empty.png', { type: 'image/png' }), 'image')).toThrow('非空');
    vi.mocked(fetchAssetDetail).mockResolvedValue({ id: source.id, coverUrl: old });
    vi.mocked(uploadStudioFile).mockRejectedValue(new Error('上传失败'));
    await expect(replaceLibraryMedia(source, 'image', old, image)).rejects.toThrow('上传失败');
    expect(updateSalesMaterial).not.toHaveBeenCalled();
    expect(localStorage.getItem('beike.custom_assets')).toBeNull();
  });
  it('patches an existing sound without resending its name or group', async () => {
    vi.mocked(uploadStudioFile).mockResolvedValue('/new.mp3');
    await replaceLibraryMedia({ ...source, type: 'sound' }, 'audio', '/old.mp3', new File(['sound'], 'new.mp3', { type: 'audio/mpeg' }));
    expect(updateSalesSound).toHaveBeenCalledExactlyOnceWith(source.id, { audioUrl: '/new.mp3' });
  });
});
