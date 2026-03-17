import { create } from 'zustand';
import type {
  CharacterNode,
  CharacterRelationship,
  RelationshipType,
  WhatIfResult,
} from '@/lib/types/relationship';

interface RelationshipState {
  // Data
  characters: CharacterNode[];
  relationships: CharacterRelationship[];
  relationshipTypes: RelationshipType[];

  // Selection
  selectedCharacterId: string | null;
  selectedRelationshipId: string | null;

  // Timeline
  currentEpisodeId: string | null;

  // View
  viewMode: '3d';

  // What-If
  whatIfMode: boolean;
  whatIfResults: WhatIfResult | null;

  // Actions
  setCharacters: (characters: CharacterNode[]) => void;
  setRelationships: (relationships: CharacterRelationship[]) => void;
  setRelationshipTypes: (types: RelationshipType[]) => void;
  selectCharacter: (id: string | null) => void;
  selectRelationship: (id: string | null) => void;
  setCurrentEpisode: (episodeId: string | null) => void;
  toggleWhatIfMode: () => void;
  setWhatIfResults: (results: WhatIfResult | null) => void;
  addRelationship: (relationship: CharacterRelationship) => void;
  updateRelationship: (id: string, data: Partial<CharacterRelationship>) => void;
  removeRelationship: (id: string) => void;
  updateCharacterPosition: (id: string, position: { x: number; y: number; z: number }) => void;
}

export const useRelationshipStore = create<RelationshipState>((set) => ({
  // Initial state
  characters: [],
  relationships: [],
  relationshipTypes: [],
  selectedCharacterId: null,
  selectedRelationshipId: null,
  currentEpisodeId: null,
  viewMode: '3d',
  whatIfMode: false,
  whatIfResults: null,

  // Actions
  setCharacters: (characters) => set({ characters }),
  setRelationships: (relationships) => set({ relationships }),
  setRelationshipTypes: (types) => set({ relationshipTypes: types }),
  selectCharacter: (id) => set({ selectedCharacterId: id }),
  selectRelationship: (id) => set({ selectedRelationshipId: id }),
  setCurrentEpisode: (episodeId) => set({ currentEpisodeId: episodeId }),
  toggleWhatIfMode: () => set((state) => ({
    whatIfMode: !state.whatIfMode,
    whatIfResults: !state.whatIfMode ? state.whatIfResults : null,
  })),
  setWhatIfResults: (results) => set({ whatIfResults: results }),
  addRelationship: (relationship) => set((state) => ({
    relationships: [...state.relationships, relationship],
  })),
  updateRelationship: (id, data) => set((state) => ({
    relationships: state.relationships.map((r) =>
      r.id === id ? { ...r, ...data } : r
    ),
  })),
  removeRelationship: (id) => set((state) => ({
    relationships: state.relationships.filter((r) => r.id !== id),
    selectedRelationshipId: state.selectedRelationshipId === id ? null : state.selectedRelationshipId,
  })),
  updateCharacterPosition: (id, position) => set((state) => ({
    characters: state.characters.map((c) =>
      c.id === id ? { ...c, position } : c
    ),
  })),
}));
