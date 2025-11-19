import { create } from 'zustand';
import { Webtoon, Episode, Cut, Process, File } from '../supabase';
import { UserProfile } from '../api/auth';
import type { User } from '@supabase/supabase-js';

interface AppState {
  // 선택된 항목들
  selectedWebtoon: Webtoon | null;
  selectedEpisode: Episode | null;
  selectedCut: Cut | null;
  selectedProcess: Process | null;

  // URL 동기화를 위한 대기 ID
  pendingWebtoonId: string | null;
  pendingEpisodeId: string | null;
  pendingCutId: string | null;
  pendingProcessId: string | null;

  // 데이터
  webtoons: Webtoon[];
  processes: Process[];

  // 뷰 모드
  viewMode: 'webtoon' | 'process';

  // 검색
  searchQuery: string;
  activeSearchQuery: string; // 실제 검색에 사용되는 쿼리
  searchResults: File[];

  // 인증
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;

  // Actions
  setSelectedWebtoon: (webtoon: Webtoon | null) => void;
  setSelectedEpisode: (episode: Episode | null) => void;
  setSelectedCut: (cut: Cut | null) => void;
  setSelectedProcess: (process: Process | null) => void;
  setPendingWebtoonId: (id: string | null) => void;
  setPendingEpisodeId: (id: string | null) => void;
  setPendingCutId: (id: string | null) => void;
  setPendingProcessId: (id: string | null) => void;
  setWebtoons: (webtoons: Webtoon[]) => void;
  setProcesses: (processes: Process[]) => void;
  setViewMode: (mode: 'webtoon' | 'process') => void;
  setSearchQuery: (query: string) => void;
  setActiveSearchQuery: (query: string) => void;
  setSearchResults: (results: File[]) => void;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  selectedWebtoon: null,
  selectedEpisode: null,
  selectedCut: null,
  selectedProcess: null,
  pendingWebtoonId: null,
  pendingEpisodeId: null,
  pendingCutId: null,
  pendingProcessId: null,
  webtoons: [],
  processes: [],
  viewMode: 'webtoon',
  searchQuery: '',
  activeSearchQuery: '',
  searchResults: [],
  user: null,
  profile: null,
  isLoading: true,

  // Actions
  setSelectedWebtoon: (webtoon) => set({
    selectedWebtoon: webtoon,
    selectedEpisode: null,
    selectedCut: null,
    pendingWebtoonId: null,
    pendingEpisodeId: null,
    pendingCutId: null,
  }),
  setSelectedEpisode: (episode) => set({
    selectedEpisode: episode,
    selectedCut: null,
    pendingEpisodeId: null,
    pendingCutId: null,
  }),
  setSelectedCut: (cut) => set({
    selectedCut: cut,
    pendingCutId: null,
  }),
  setSelectedProcess: (process) => set({
    selectedProcess: process,
    pendingProcessId: null,
  }),
  setPendingWebtoonId: (id) => set({ pendingWebtoonId: id }),
  setPendingEpisodeId: (id) => set({ pendingEpisodeId: id }),
  setPendingCutId: (id) => set({ pendingCutId: id }),
  setPendingProcessId: (id) => set({ pendingProcessId: id }),
  setWebtoons: (webtoons) => set({ webtoons }),
  setProcesses: (processes) => set({ processes }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveSearchQuery: (query) => set({ activeSearchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ isLoading: loading }),
  reset: () => set({
    selectedWebtoon: null,
    selectedEpisode: null,
    selectedCut: null,
    selectedProcess: null,
    pendingWebtoonId: null,
    pendingEpisodeId: null,
    pendingCutId: null,
    pendingProcessId: null,
    searchQuery: '',
    activeSearchQuery: '',
    searchResults: [],
    user: null,
    profile: null
  })
}));


