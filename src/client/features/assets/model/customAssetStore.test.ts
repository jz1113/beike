import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectCustomMedia,
  createMediaFolder,
  deleteMediaFolder,
  libraryMediaKey,
  moveLibraryMedia,
  readMediaFolders,
  relocateMediaFolder,
  removeCollectedMedia,
  type LibraryMediaPlacement,
} from './customAssetStore';
import { filterMaterialTasks, groupTasksByTimeline, type MaterialFilterOptions } from './materialTimeline';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('creates persistent children under the requested parent and rejects sibling or preset collisions', () => {
  const existing = ['场景/室内', '场景/室外'];
  expect(() => createMediaFolder('室内', '场景', existing)).toThrow('同名');
  const path = createMediaFolder(' 夜景 ', '场景', existing);
  expect(path).toBe('场景/夜景');
  expect(() => createMediaFolder('夜景', '场景')).toThrow('同名');
  expect(() => createMediaFolder('A/B', path)).toThrow('斜杠');
  expect(readMediaFolders()).toEqual([path]);
  expect(createMediaFolder('夜景')).toBe('我的文件夹/夜景');
});

it('removes a category subtree while preserving the original and similarly named siblings', () => {
  const parent = createMediaFolder('夜景', '场景');
  const child = createMediaFolder('街道', parent);
  const sibling = createMediaFolder('夜景二', '场景');
  const url = '/storage/night.png';
  collectCustomMedia('原图', url, 'image', '导入素材', false);
  for (const folder of [parent, child, sibling]) collectCustomMedia('收藏', url, 'image', folder);
  removeCollectedMedia(url, parent);
  deleteMediaFolder(parent);
  expect(readMediaFolders()).toEqual([sibling]);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)).toEqual([
    expect.objectContaining({ folder: sibling }), expect.objectContaining({ folder: '导入素材' }),
  ]);
  expect(() => collectCustomMedia('收藏', url, 'image', child)).toThrow('已删除');
});

it('renames and moves descendants and image/script collections, preserving originals and siblings', () => {
  const source = createMediaFolder('参考');
  const child = createMediaFolder('细节', source);
  const sibling = createMediaFolder('参考二');
  collectCustomMedia('图片', '/storage/source.png', 'image', child);
  collectCustomMedia('脚本', 'script-1', 'script', source);
  collectCustomMedia('原图', '/storage/original.png', 'image', child, false);
  const original = JSON.parse(localStorage.getItem('beike.custom_assets')!)[0];
  const renamed = relocateMediaFolder(source, '灵感', '我的文件夹', readMediaFolders());
  expect(readMediaFolders()).toEqual([renamed, renamed + '/细节', sibling]);
  const target = relocateMediaFolder(renamed, '灵感', sibling, readMediaFolders());
  expect(readMediaFolders()).toEqual([target, target + '/细节', sibling]);
  const assets = JSON.parse(localStorage.getItem('beike.custom_assets')!);
  expect(assets[0]).toEqual(original);
  expect(assets[1]).toMatchObject({ folder: target, scriptId: 'script-1' });
  expect(assets[2]).toMatchObject({ folder: target + '/细节', mediaUrl: '/storage/source.png' });
  deleteMediaFolder(target);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)).toEqual([original]);
});

it('rejects self/descendant moves, invalid names, unknown destinations and duplicate built-in categories without writes', () => {
  const source = createMediaFolder('夜景', '场景');
  const child = createMediaFolder('街道', source);
  const before = localStorage.getItem('beike.media_folders.v1');
  const known = [source, child, '场景', '场景/室内'];
  for (const parent of [source, child]) expect(() => relocateMediaFolder(source, '夜景', parent, known)).toThrow('自身或子分类');
  expect(() => relocateMediaFolder(source, '室内', '场景', known)).toThrow('同名');
  expect(() => relocateMediaFolder(source, 'A/B', '场景', known)).toThrow('斜杠');
  expect(() => relocateMediaFolder(source, 'A', '不存在', known)).toThrow('不存在');
  expect(() => relocateMediaFolder('场景/室内', 'A', '场景', known)).toThrow('已创建');
  expect(localStorage.getItem('beike.media_folders.v1')).toEqual(before);
});

it('keeps legacy collections removable after moving out of My Folders and prevents incompatible media moves', () => {
  const source = createMediaFolder('老收藏');
  localStorage.setItem('beike.custom_assets', JSON.stringify([{ id: 'legacy', folder: source, mediaKind: 'image', mediaUrl: '/storage/a.png' }]));
  expect(() => relocateMediaFolder(source, '老收藏', '声音', ['声音'])).toThrow('类型');
  const target = relocateMediaFolder(source, '老收藏', '场景', ['场景']);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)[0]).toMatchObject({ folder: target, collection: true });
  removeCollectedMedia('/storage/a.png', target);
  expect(JSON.parse(localStorage.getItem('beike.custom_assets')!)).toEqual([]);
});

it('rolls back the folder tree if saving updated memberships fails', () => {
  const source = createMediaFolder('夜景', '场景');
  collectCustomMedia('图片', '/storage/a.png', 'image', source);
  const before = localStorage.getItem('beike.custom_assets');
  const write = localStorage.setItem;
  localStorage.setItem = vi.fn((key: string, value: string) => {
    if (key === 'beike.custom_assets') throw new Error('存储空间不足');
    write(key, value);
  });
  expect(() => relocateMediaFolder(source, '白天', '场景', ['场景'])).toThrow('存储空间不足');
  expect(readMediaFolders()).toEqual([source]);
  expect(localStorage.getItem('beike.custom_assets')).toEqual(before);
});

const image: LibraryMediaPlacement = { kind: 'image', url: '/storage/a.png', name: '场景', folders: ['场景/室内', '我的文件夹/收藏'] };
const script: LibraryMediaPlacement = { kind: 'script', url: 'script-1', name: '动作', folders: ['动作'] };
const read = () => JSON.parse(localStorage.getItem('beike.custom_assets') || '[]');
const paths = (item: LibraryMediaPlacement) => read().find((row: { placementKey?: string }) => row.placementKey === libraryMediaKey(item))?.placementFolders;

it('moves multiple media in one write, preserves unrelated memberships and deduplicates the destination', () => {
  const target = createMediaFolder('目标', '场景');
  collectCustomMedia('原图', image.url, 'image', '导入素材', false);
  const original = read()[0];
  const other = { ...image, url: '/storage/b.png', folders: ['场景/室内', target] };
  const write = vi.spyOn(localStorage, 'setItem');
  moveLibraryMedia([image, other], '场景', target, [target]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(paths(image)).toEqual(['我的文件夹/收藏', target]);
  expect(paths(other)).toEqual([target]);
  expect(read()[0]).toEqual(original);
  moveLibraryMedia([{ ...image, folders: ['场景/室内'] }], target, '场景/室外', ['场景/室外']);
  expect(paths(image)).toEqual(['我的文件夹/收藏', '场景/室外']);
});

it('moves mixed kinds from All Folders to a custom category and treats scripts as records', () => {
  const target = createMediaFolder('项目参考');
  moveLibraryMedia([image, script], '', target, [target]);
  expect(paths(image)).toEqual([target]);
  expect(paths(script)).toEqual([target]);
});

it('rejects incompatible, missing or stale destinations/source memberships without partial writes', () => {
  const target = createMediaFolder('室外', '场景');
  expect(() => moveLibraryMedia([image, script], '', target, [target])).toThrow('类型');
  expect(read()).toEqual([]);
  expect(() => moveLibraryMedia([image], '不存在', target, [target])).toThrow('分类已变化');
  expect(() => moveLibraryMedia([image], '', '已删除', [])).toThrow('不存在');
  moveLibraryMedia([image], '', target, [target]);
  const before = localStorage.getItem('beike.custom_assets');
  expect(() => moveLibraryMedia([image], '场景/室内', '场景/室外', ['场景/室外'])).toThrow('分类已变化');
  expect(localStorage.getItem('beike.custom_assets')).toBe(before);
});

it('updates moved media when their target category is renamed, relocated or deleted', () => {
  const target = createMediaFolder('夜景', '场景');
  moveLibraryMedia([image], '', target, [target]);
  const renamed = relocateMediaFolder(target, '傍晚', '场景', ['场景']);
  expect(paths(image)).toEqual([renamed]);
  expect(() => relocateMediaFolder(renamed, '傍晚', '声音', ['声音'])).toThrow('类型');
  const moved = relocateMediaFolder(renamed, '傍晚', '我的文件夹', []);
  expect(paths(image)).toEqual([moved]);
  deleteMediaFolder(moved);
  expect(paths(image)).toBeUndefined();
});

it('keeps collecting and removing moved media consistent with their effective folders', () => {
  const target = createMediaFolder('A');
  const another = createMediaFolder('B');
  collectCustomMedia(image.name, image.url, 'image', another);
  moveLibraryMedia([image], '', target, [target]);
  collectCustomMedia(image.name, image.url, 'image', another);
  expect(paths(image)).toEqual([target, another]);
  removeCollectedMedia(image.url, another);
  expect(paths(image)).toEqual([target]);
  removeCollectedMedia(image.url, target);
  expect(paths(image)).toBeUndefined();
});

it('leaves the whole batch untouched if storage is full', () => {
  const target = createMediaFolder('目标');
  const before = localStorage.getItem('beike.custom_assets');
  localStorage.setItem = vi.fn(() => { throw new Error('存储空间不足'); });
  expect(() => moveLibraryMedia([image, script], '', target, [target])).toThrow('存储空间不足');
  expect(localStorage.getItem('beike.custom_assets')).toEqual(before);
});

it('keeps collection-only media available when the former category is deleted after moving', () => {
  const source = createMediaFolder('来源');
  const target = createMediaFolder('目标');
  collectCustomMedia(image.name, image.url, 'image', source);
  const originalId = read()[0].id;
  moveLibraryMedia([{ ...image, folders: [source] }], source, target, [target]);
  deleteMediaFolder(source);
  expect(read().find((item: { id: string }) => item.id === originalId)).toMatchObject({ folder: target, mediaUrl: image.url });
  expect(paths(image)).toEqual([target]);
});

const options: MaterialFilterOptions = { sourceType: 'ai', mediaCategory: 'all', searchInput: '', sortOrder: 'newest' };

describe('material filtering and timeline', () => {
  it('keeps generated reference-based results out of uploads and uploads out of AI results', () => {
    const generated = { id: 'generated', resultUrl: '/result.png', referenceImageUrl: '/reference.png' };
    const uploaded = { id: 'uploaded', resultUrl: '/upload.png', isUploaded: true };
    const tasks = [generated, uploaded];
    expect(filterMaterialTasks(tasks, { ...options, sourceType: 'uploaded' })).toEqual([uploaded]);
    expect(filterMaterialTasks(tasks, options)).toEqual([generated]);
  });

  it('hides failures even with result URLs while preserving pending and running tasks', () => {
    const tasks = [
      { id: 'failed', status: 'FAILURE', resultUrl: '/failed.png' },
      { id: 'failed-doc', status: 'FAILURE', mediaType: 'document', prompt: '方案' },
      { id: 'pending', status: 'PENDING' },
      { id: 'running', status: 'IN_PROGRESS' },
      { id: 'success', status: 'SUCCESS', resultUrl: '/result.png' },
    ];
    expect(filterMaterialTasks(tasks, options).map(task => task.id)).toEqual(['pending', 'running', 'success']);
    expect(groupTasksByTimeline(filterMaterialTasks(tasks.slice(0, 2), options), 'newest')).toEqual([]);
    expect(tasks).toHaveLength(5);
  });

  it('combines media, search and completion filters without changing the input', () => {
    const tasks = [
      { id: 'video', title: '产品 Video', mediaType: 'video', resultUrl: '/video.mp4', createdAt: 2 },
      { id: 'image', title: '产品 Image', mediaType: 'image', resultUrl: '/image.png', createdAt: 3 },
      { id: 'failed', title: '产品 Video', mediaType: 'video', status: 'FAILURE', createdAt: 4 },
    ];
    expect(filterMaterialTasks(tasks, { ...options, mediaCategory: 'video', searchInput: ' VIDEO ', statusFilter: 'completed' }).map((task) => task.id)).toEqual(['video']);
    expect(tasks.map((task) => task.id)).toEqual(['video', 'image', 'failed']);
  });

  it('finds a prompt beyond the abbreviated title while respecting the media filter', () => {
    const tasks = [
      { id: 'image', mediaType: 'image', title: '海面', prompt: '海面上出现一艘蓝色小船' },
      { id: 'video', mediaType: 'video', title: '小船', prompt: '镜头推进' },
    ];
    expect(filterMaterialTasks(tasks, { ...options, mediaCategory: 'image', searchInput: '小船' }).map(task => task.id)).toEqual(['image']);
  });

  it('orders today, yesterday and earlier dates in both chronological directions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12));
    const tasks = [26, 25, 24].map((day) => ({ id: String(day), createdAt: new Date(2026, 9, day, 10).getTime() }));
    expect(groupTasksByTimeline(tasks, 'newest').map((group) => group.key)).toEqual(['today', 'yesterday', '2026-10-24']);
    expect(groupTasksByTimeline(tasks, 'oldest').map((group) => group.key)).toEqual(['2026-10-24', 'yesterday', 'today']);
  });

  it('uses calendar boundaries for today and excludes future records from the time filter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12));
    const tasks = [25, 26, 27].map((day) => ({ id: String(day), createdAt: new Date(2026, 9, day, 10).getTime() }));
    expect(filterMaterialTasks(tasks, { ...options, timeFilter: 'today' }).map((task) => task.id)).toEqual(['26']);
    expect(filterMaterialTasks(tasks, { ...options, timeFilter: 'yesterday' }).map((task) => task.id)).toEqual(['25']);
  });

  it('preserves global alphabetical order across dates instead of regrouping by time', () => {
    const tasks = [{ id: 'z', title: 'Z', createdAt: 20 }, { id: 'a', title: 'A', createdAt: 10 }];
    const sorted = filterMaterialTasks(tasks, { ...options, sortOrder: 'name' });
    expect(groupTasksByTimeline(sorted, 'name').flatMap((group) => group.tasks.map((task) => task.id))).toEqual(['a', 'z']);
    expect(groupTasksByTimeline([], 'name')).toEqual([]);
  });
});
