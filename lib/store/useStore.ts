import { create } from 'zustand';
import { Webtoon, Process } from '../supabase';
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

  // Actions
  setWebtoons: (webtoons: Webtoon[]) => void;
  setProcesses: (processes: Process[]) => void;
  setSearchQuery: (query: string) => void;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
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

  // Actions
  setWebtoons: (webtoons) => set({ webtoons }),
  setProcesses: (processes) => set({ processes }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ isLoading: loading }),
  reset: () => set({
    searchQuery: '',
    user: null,
    profile: null
  })
}));


