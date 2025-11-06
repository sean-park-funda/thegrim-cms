import { create } from 'zustand';
import { Webtoon, Episode, Cut, Process, File } from '../supabase';

interface AppState {
  // 선택된 항목들
  selectedWebtoon: Webtoon | null;
  selectedEpisode: Episode | null;
  selectedCut: Cut | null;
  selectedProcess: Process | null;

  // 데이터
  webtoons: Webtoon[];
  processes: Process[];

  // 뷰 모드
  viewMode: 'webtoon' | 'process';

  // 검색
  searchQuery: string;
  searchResults: File[];

  // Actions
  setSelectedWebtoon: (webtoon: Webtoon | null) => void;
  setSelectedEpisode: (episode: Episode | null) => void;
  setSelectedCut: (cut: Cut | null) => void;
  setSelectedProcess: (process: Process | null) => void;
  setWebtoons: (webtoons: Webtoon[]) => void;
  setProcesses: (processes: Process[]) => void;
  setViewMode: (mode: 'webtoon' | 'process') => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: File[]) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  selectedWebtoon: null,
  selectedEpisode: null,
  selectedCut: null,
  selectedProcess: null,
  webtoons: [],
  processes: [],
  viewMode: 'webtoon',
  searchQuery: '',
  searchResults: [],

  // Actions
  setSelectedWebtoon: (webtoon) => set({ selectedWebtoon: webtoon, selectedEpisode: null, selectedCut: null }),
  setSelectedEpisode: (episode) => set({ selectedEpisode: episode, selectedCut: null }),
  setSelectedCut: (cut) => set({ selectedCut: cut }),
  setSelectedProcess: (process) => set({ selectedProcess: process }),
  setWebtoons: (webtoons) => set({ webtoons }),
  setProcesses: (processes) => set({ processes }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  reset: () => set({
    selectedWebtoon: null,
    selectedEpisode: null,
    selectedCut: null,
    selectedProcess: null,
    searchQuery: '',
    searchResults: []
  })
}));


