import { create } from 'zustand';
import { Webtoon, Process, Episode, Cut } from '../supabase';
import { UserProfile } from '../api/auth';
import type { User } from '@supabase/supabase-js';

interface AppState {
  // 데이터 캐시 (선택사항)
  webtoons: Webtoon[];
  processes: Process[];

  // 검색 (검색 페이지에서만 사용)
  searchQuery: string;

  // 인증
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;

  // 선택된 항목 (브레드크럼 네비게이션용)
  selectedWebtoon: Webtoon | null;
  selectedEpisode: Episode | null;
  selectedCut: Cut | null;

  // Actions
  setWebtoons: (webtoons: Webtoon[]) => void;
  setProcesses: (processes: Process[]) => void;
  setSearchQuery: (query: string) => void;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setSelectedWebtoon: (webtoon: Webtoon | null) => void;
  setSelectedEpisode: (episode: Episode | null) => void;
  setSelectedCut: (cut: Cut | null) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  webtoons: [],
  processes: [],
  searchQuery: '',
  user: null,
  profile: null,
  isLoading: true,
  selectedWebtoon: null,
  selectedEpisode: null,
  selectedCut: null,

  // Actions
  setWebtoons: (webtoons) => set({ webtoons }),
  setProcesses: (processes) => set({ processes }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ isLoading: loading }),
  setSelectedWebtoon: (webtoon) => set({ selectedWebtoon: webtoon }),
  setSelectedEpisode: (episode) => set({ selectedEpisode: episode }),
  setSelectedCut: (cut) => set({ selectedCut: cut }),
  reset: () => set({
    searchQuery: '',
    user: null,
    profile: null,
    selectedWebtoon: null,
    selectedEpisode: null,
    selectedCut: null
  })
}));


