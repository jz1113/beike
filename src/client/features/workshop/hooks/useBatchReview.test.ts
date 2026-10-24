import { createElement, type SetStateAction } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchProductItem, BatchTaskItem } from '../model/batchTypes';
import { reviewWorkshopTask } from '../api/batchCommands';
import { isDeliverableWorkshopResult } from '../model/generation/workshopReadiness';
import { useBatchReview } from './useBatchReview';

vi.mock('../api/batchCommands', () => ({ reviewWorkshopTask: vi.fn() }));

function task(id: string, review: BatchTaskItem['outputReview'] = 'unreviewed'): BatchTaskItem {
  return { id, shot_no: 1, title: id, prompt: id, status: 'SUCCESS', resultUrl: `/storage/${id}.jpg`, outputReview: review };
}

function product(id: string, tasks: BatchTaskItem[], selected = true): BatchProductItem {
  return { id, itemId: id, title: id, platform: 'jd', price: 0, category: '', brand: '', coverImage: '',
    mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected,
    allTypedImages: [], selectedProductImages: [], prompts: [], tasks };
}

function setup(items: BatchProductItem[]) {
  const itemsRef = { current: items };
  const ensureSaved = vi.fn().mockResolvedValue(true);
  const showToast = vi.fn();
  const retry = vi.fn().mockResolvedValue(undefined);
  const setItems = (update: SetStateAction<BatchProductItem[]>) => {
    itemsRef.current = typeof update === 'function' ? update(itemsRef.current) : update;
  };
  let review!: ReturnType<typeof useBatchReview>;
  function Harness() {
    review = useBatchReview(itemsRef, setItems, retry, showToast, ensureSaved);
    return null;
  }
  renderToString(createElement(Harness));
  return { review, itemsRef, ensureSaved, showToast, retry };
}

beforeEach(() => { vi.mocked(reviewWorkshopTask).mockReset().mockResolvedValue({ success: true }); });

describe('workshop image review', () => {
  it('excludes immediately, waits for saving before submitting, and restores on a second click', async () => {
    const { review, itemsRef, ensureSaved, retry } = setup([product('one', [task('shot')])]);
    let save!: (saved: boolean) => void;
    ensureSaved.mockImplementationOnce(() => new Promise(resolve => { save = resolve; }));
    const first = review.reviewTask('one', 'shot', 'rejected');
    expect(itemsRef.current[0].tasks[0].outputReview).toBe('rejected');
    expect(isDeliverableWorkshopResult(itemsRef.current[0].tasks[0])).toBe(false);
    expect(reviewWorkshopTask).not.toHaveBeenCalled();
    save(true);
    await expect(first).resolves.toBe(true);
    await expect(review.reviewTask('one', 'shot', 'accepted')).resolves.toBe(true);
    expect(isDeliverableWorkshopResult(itemsRef.current[0].tasks[0])).toBe(true);
    expect(reviewWorkshopTask).toHaveBeenNthCalledWith(1, 'shot', { decision: 'rejected' });
    expect(reviewWorkshopTask).toHaveBeenNthCalledWith(2, 'shot', { decision: 'accepted' });
    expect(retry).not.toHaveBeenCalled();
  });

  it('rolls back an exclusion if saving or review submission fails', async () => {
    const { review, itemsRef, ensureSaved, showToast } = setup([product('one', [task('shot', 'accepted')])]);
    ensureSaved.mockResolvedValueOnce(false);
    await expect(review.reviewTask('one', 'shot', 'rejected')).resolves.toBe(false);
    expect(reviewWorkshopTask).not.toHaveBeenCalled();
    expect(itemsRef.current[0].tasks[0].outputReview).toBe('accepted');
    vi.mocked(reviewWorkshopTask).mockRejectedValueOnce(new Error('审核失败'));
    await expect(review.reviewTask('one', 'shot', 'rejected')).resolves.toBe(false);
    expect(itemsRef.current[0].tasks[0].outputReview).toBe('accepted');
    expect(showToast).toHaveBeenLastCalledWith('审核失败');
  });

  it('keeps excluded images excluded when approving and skips unselected or unusable results', async () => {
    const { review, itemsRef } = setup([
      product('one', [task('keep'), task('excluded', 'rejected'), task('retry', 'retry_requested'),
        { ...task('old'), resultStatus: 'superseded' }, { ...task('failed'), status: 'FAILURE' },
        { ...task('pending'), status: 'PENDING' }, { ...task('ephemeral'), resultUrl: 'blob:expired' }]),
      product('two', [task('other')]), product('unselected', [task('hidden')], false),
    ]);
    await expect(review.reviewBatch('accepted')).resolves.toBe(true);
    expect(vi.mocked(reviewWorkshopTask).mock.calls).toEqual([['keep', { decision: 'accepted' }], ['other', { decision: 'accepted' }]]);
    expect(itemsRef.current[0].tasks[1].outputReview).toBe('rejected');
    expect(itemsRef.current[0].tasks[2].outputReview).toBe('retry_requested');
    expect(itemsRef.current[2].tasks[0].outputReview).toBe('unreviewed');
  });

  it('rejects all current results without retrying generation and supports later restoration', async () => {
    const { review, itemsRef, retry } = setup([product('one', [task('one', 'accepted'), task('two')])]);
    await expect(review.reviewBatch('rejected')).resolves.toBe(true);
    expect(itemsRef.current[0].tasks.every(task => task.outputReview === 'rejected')).toBe(true);
    await expect(review.reviewTask('one', 'two', 'accepted')).resolves.toBe(true);
    expect(itemsRef.current[0].tasks[1].outputReview).toBe('accepted');
    expect(retry).not.toHaveBeenCalled();
  });

  it('serializes bulk submissions, blocks duplicate actions, and stops after a failed submission', async () => {
    const { review, itemsRef, showToast } = setup([product('one', [task('one'), task('two'), task('three')])]);
    let finish!: () => void;
    vi.mocked(reviewWorkshopTask).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ success: true }); }))
      .mockRejectedValueOnce(new Error('第二张保存失败'));
    const first = review.reviewBatch('accepted');
    await vi.waitFor(() => expect(reviewWorkshopTask).toHaveBeenCalledTimes(1));
    await expect(review.reviewBatch('rejected')).resolves.toBe(false);
    await expect(review.reviewTask('one', 'two', 'rejected')).resolves.toBe(false);
    finish();
    await expect(first).resolves.toBe(false);
    expect(reviewWorkshopTask).toHaveBeenCalledTimes(2);
    expect(itemsRef.current[0].tasks.map(task => task.outputReview)).toEqual(['accepted', 'unreviewed', 'unreviewed']);
    expect(showToast).toHaveBeenLastCalledWith('第二张保存失败');
    await expect(review.reviewTask('one', 'three', 'rejected')).resolves.toBe(true);
  });

  it('does not overwrite a replacement result when an older review fails', async () => {
    const { review, itemsRef, ensureSaved } = setup([product('one', [task('shot')])]);
    let save!: (saved: boolean) => void;
    ensureSaved.mockImplementationOnce(() => new Promise(resolve => { save = resolve; }));
    const first = review.reviewTask('one', 'shot', 'rejected');
    itemsRef.current[0].tasks[0] = { ...task('shot'), resultUrl: '/storage/replacement.jpg' };
    save(false);
    await expect(first).resolves.toBe(false);
    expect(itemsRef.current[0].tasks[0]).toMatchObject({ resultUrl: '/storage/replacement.jpg', outputReview: 'unreviewed' });
  });
});
