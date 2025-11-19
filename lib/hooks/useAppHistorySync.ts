'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { shallow } from 'zustand/shallow';

type LocationState = {
  viewMode: 'webtoon' | 'process';
  webtoonId: string | null;
  episodeId: string | null;
  cutId: string | null;
  processId: string | null;
  search: string;
};

const selectRoutingSnapshot = (state: ReturnType<typeof useStore.getState>): LocationState => ({
  viewMode: state.viewMode,
  webtoonId: state.selectedWebtoon?.id ?? null,
  episodeId: state.selectedEpisode?.id ?? null,
  cutId: state.selectedCut?.id ?? null,
  processId: state.selectedProcess?.id ?? null,
  search: state.activeSearchQuery.trim(),
});

const parseSearchParams = (params: URLSearchParams): LocationState => {
  const viewParam = params.get('view');
  const searchParam = params.get('search')?.trim() ?? '';

  return {
    viewMode: viewParam === 'process' ? 'process' : 'webtoon',
    webtoonId: params.get('webtoon'),
    episodeId: params.get('episode'),
    cutId: params.get('cut'),
    processId: params.get('process'),
    search: searchParam,
  };
};

const buildQueryString = (state: LocationState): string => {
  const params = new URLSearchParams();

  if (state.viewMode === 'process') {
    params.set('view', 'process');
  }

  if (state.webtoonId) {
    params.set('webtoon', state.webtoonId);
    if (state.episodeId) {
      params.set('episode', state.episodeId);
      if (state.cutId) {
        params.set('cut', state.cutId);
      }
    }
  }

  if (state.processId && state.viewMode === 'process') {
    params.set('process', state.processId);
  }

  if (state.search) {
    params.set('search', state.search);
  }

  return params.toString();
};

const isAtMainState = (state: LocationState) =>
  state.viewMode === 'webtoon' &&
  !state.search &&
  !state.webtoonId &&
  !state.episodeId &&
  !state.cutId &&
  !state.processId;

export function useAppHistorySync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);
  const currentQueryRef = useRef(searchParamsString);
  const wasAtMainRef = useRef(false);
  const skipNextPopRef = useRef(false);

  useEffect(() => {
    currentQueryRef.current = searchParamsString;
  }, [searchParamsString]);

  useEffect(() => {
    const parsed = parseSearchParams(new URLSearchParams(searchParamsString));
    const store = useStore.getState();
    const normalizedSearch = parsed.search;

    if (store.viewMode !== parsed.viewMode) {
      store.setViewMode(parsed.viewMode);
    }

    if (store.activeSearchQuery.trim() !== normalizedSearch) {
      store.setSearchQuery(normalizedSearch);
      store.setActiveSearchQuery(normalizedSearch);
    }

    if (!parsed.webtoonId) {
      if (store.selectedWebtoon) {
        store.setSelectedWebtoon(null);
      }
      if (store.pendingWebtoonId) {
        store.setPendingWebtoonId(null);
      }
    } else if (store.selectedWebtoon?.id !== parsed.webtoonId) {
      store.setPendingWebtoonId(parsed.webtoonId);
    }

    if (!parsed.episodeId || !parsed.webtoonId) {
      if (store.selectedEpisode) {
        store.setSelectedEpisode(null);
      }
      if (store.pendingEpisodeId) {
        store.setPendingEpisodeId(null);
      }
    } else if (store.selectedEpisode?.id !== parsed.episodeId) {
      store.setPendingEpisodeId(parsed.episodeId);
    }

    if (!parsed.cutId || !parsed.episodeId) {
      if (store.selectedCut) {
        store.setSelectedCut(null);
      }
      if (store.pendingCutId) {
        store.setPendingCutId(null);
      }
    } else if (store.selectedCut?.id !== parsed.cutId) {
      store.setPendingCutId(parsed.cutId);
    }

    if (parsed.viewMode !== 'process' || !parsed.processId) {
      if (store.selectedProcess) {
        store.setSelectedProcess(null);
      }
      if (store.pendingProcessId) {
        store.setPendingProcessId(null);
      }
    } else if (store.selectedProcess?.id !== parsed.processId) {
      store.setPendingProcessId(parsed.processId);
    }
  }, [searchParamsString]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unsubscribe = useStore.subscribe(
      (state) => selectRoutingSnapshot(state),
      (nextState) => {
        const query = buildQueryString(nextState);
        if (query === currentQueryRef.current) {
          return;
        }
        const url = query ? `${pathname}?${query}` : pathname;
        currentQueryRef.current = query;
        router.push(url, { scroll: false });
      },
      { equalityFn: shallow }
    );

    return () => unsubscribe();
  }, [pathname, router]);

  const pendingWebtoonData = useStore(
    (state) => ({
      pendingWebtoonId: state.pendingWebtoonId,
      webtoons: state.webtoons,
    }),
    shallow
  );
  const pendingProcessData = useStore(
    (state) => ({
      pendingProcessId: state.pendingProcessId,
      processes: state.processes,
    }),
    shallow
  );
  const setSelectedWebtoon = useStore((state) => state.setSelectedWebtoon);
  const setPendingWebtoonId = useStore((state) => state.setPendingWebtoonId);
  const setSelectedProcess = useStore((state) => state.setSelectedProcess);
  const setPendingProcessId = useStore((state) => state.setPendingProcessId);

  useEffect(() => {
    if (!pendingWebtoonData.pendingWebtoonId) return;
    const match = pendingWebtoonData.webtoons.find(
      (webtoon) => webtoon.id === pendingWebtoonData.pendingWebtoonId
    );
    if (match) {
      setSelectedWebtoon(match);
      setPendingWebtoonId(null);
    }
  }, [pendingWebtoonData, setPendingWebtoonId, setSelectedWebtoon]);

  useEffect(() => {
    if (!pendingProcessData.pendingProcessId) return;
    const match = pendingProcessData.processes.find(
      (process) => process.id === pendingProcessData.pendingProcessId
    );
    if (match) {
      setSelectedProcess(match);
      setPendingProcessId(null);
    }
  }, [pendingProcessData, setPendingProcessId, setSelectedProcess]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    wasAtMainRef.current = isAtMainState(selectRoutingSnapshot(useStore.getState()));

    const unsubscribe = useStore.subscribe(
      (state) => selectRoutingSnapshot(state),
      (nextState) => {
        wasAtMainRef.current = isAtMainState(nextState);
      },
      { equalityFn: shallow }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (skipNextPopRef.current) {
        skipNextPopRef.current = false;
        return;
      }

      if (wasAtMainRef.current) {
        const shouldExit = window.confirm('서비스를 종료하시겠습니까?');
        if (!shouldExit) {
          skipNextPopRef.current = true;
          window.history.forward();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
