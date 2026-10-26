import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssetHistoryQuery } from './useAssetHistoryQuery';
import { getNextAssetPage } from '@client/shared/utils/assetTaskData';

const harness = vi.hoisted(() => ({
  effects: [] as (() => void)[], hidden: false,
  query: { fetchNextPage: vi.fn(), hasNextPage: true, isFetching: false, isError: false, refetch: vi.fn(), data: undefined },
}));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => harness.effects.push(fn),
  useState: (initial: unknown) => [initial, vi.fn()], useRef: (current: unknown) => ({ current }),
}));
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: () => harness.query, useQueryClient: () => ({}) }));
vi.mock('@client/shared/api/generation/generationApi', () => ({ fetchAssetTasks: vi.fn() }));
vi.mock('@client/shared/hooks/useDocumentHidden', () => ({ useDocumentHidden: () => harness.hidden }));

beforeEach(() => {
  vi.clearAllMocks();
  harness.effects = [];
  harness.hidden = false;
  Object.assign(harness.query, { hasNextPage: true, isFetching: false, isError: false });
});

function RunHistoryEffect(enabled = true) {
  harness.effects = [];
  useAssetHistoryQuery(enabled);
  harness.effects[0]();
}

describe('asset history pagination', () => {
  it('requests the next history page without cancelling a refresh already in progress', () => {
    RunHistoryEffect();
    expect(harness.query.fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
  });

  it('continues after each page and stops after the last page', () => {
    RunHistoryEffect();
    harness.query.isFetching = true;
    RunHistoryEffect();
    expect(harness.query.fetchNextPage).toHaveBeenCalledTimes(1);
    harness.query.isFetching = false;
    RunHistoryEffect();
    expect(harness.query.fetchNextPage).toHaveBeenCalledTimes(2);
    harness.query.hasNextPage = false;
    RunHistoryEffect();
    expect(harness.query.fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it.each(['inactive', 'hidden', 'error', 'fetching', 'complete'])('pauses loading when %s', (reason) => {
    if (reason === 'hidden') harness.hidden = true;
    if (reason === 'error') harness.query.isError = true;
    if (reason === 'fetching') harness.query.isFetching = true;
    if (reason === 'complete') harness.query.hasNextPage = false;
    RunHistoryEffect(reason !== 'inactive');
    expect(harness.query.fetchNextPage).not.toHaveBeenCalled();
  });

  it('resumes pagination once a failed query is refreshed successfully', () => {
    harness.query.isError = true;
    RunHistoryEffect();
    harness.query.isError = false;
    RunHistoryEffect();
    expect(harness.query.fetchNextPage).toHaveBeenCalledOnce();
  });

  it('uses server totals to reach history beyond 40 records and stops on an empty response', () => {
    expect(getNextAssetPage({ tasks: Array(40), total: 81 }, 1)).toBe(2);
    expect(getNextAssetPage({ tasks: Array(40), total: 81 }, 2)).toBe(3);
    expect(getNextAssetPage({ tasks: [{}], total: 81 }, 3)).toBeUndefined();
    expect(getNextAssetPage({ tasks: [], total: 81 }, 2)).toBeUndefined();
  });
});
