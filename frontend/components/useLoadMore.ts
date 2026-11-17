"use client";

import { useCallback, useRef } from "react";
import { loadMoreOffset, loadMoreStale, mergeLoaded } from "@/lib/loadMore";

type Page<T> = { total: number; nodes: T[] };

/**
 * "Load more" that stays right when rows are removed while a page loads (#338).
 * Call `removed(id)` after a row's removal succeeded; `fetchMore(shown)` fetches
 * the next page from the right offset (retrying if a removal overtook it), and
 * `merge(current, page)` appends it to the list as it is now.
 */
export function useLoadMore<T extends { id: string }>(fetchPage: (offset: number) => Promise<Page<T>>) {
  const removals = useRef(0);
  const removedIds = useRef(new Set<string>());

  const removed = useCallback((id: string) => {
    removals.current += 1;
    removedIds.current.add(id);
  }, []);

  const fetchMore = useCallback(
    async (shown: number): Promise<Page<T>> => {
      const start = removals.current;
      for (let attempt = 0; ; attempt++) {
        const before = removals.current;
        const page = await fetchPage(loadMoreOffset(shown, start, before));
        if (!loadMoreStale(before, removals.current, attempt)) return page;
      }
    },
    [fetchPage],
  );

  const merge = useCallback(
    (current: Page<T>, page: Page<T>) => mergeLoaded(current, page, removedIds.current),
    [],
  );

  return { removed, fetchMore, merge };
}
