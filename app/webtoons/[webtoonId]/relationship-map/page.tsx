'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Graph3DView from '@/components/relationship-map/Graph3DView';
import TimelineSlider from '@/components/relationship-map/TimelineSlider';
import SidePanel from '@/components/relationship-map/SidePanel';
import type { CharacterNode, CharacterRelationship, RelationshipType } from '@/lib/types/relationship';
import type { Episode } from '@/lib/supabase';

interface PageProps {
  params: Promise<{ webtoonId: string }>;
}

export default function RelationshipMapPage({ params }: PageProps) {
  const { webtoonId } = use(params);
  const router = useRouter();

  // Data state
  const [characters, setCharacters] = useState<CharacterNode[]>([]);
  const [relationships, setRelationships] = useState<CharacterRelationship[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [webtoonTitle, setWebtoonTitle] = useState('');
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const [changedEpisodeIds, setChangedEpisodeIds] = useState<Set<string>>(new Set());

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [charsRes, relsRes, typesRes, epsRes, webtoonRes] = await Promise.all([
          fetch(`/api/characters?webtoon_id=${webtoonId}`).then(r => r.ok ? r.json() : []),
          fetch(`/api/relationships?webtoon_id=${webtoonId}`).then(r => r.ok ? r.json() : []),
          fetch('/api/relationships/types').then(r => r.ok ? r.json() : []),
          fetch(`/api/relationships/snapshots?webtoon_id=${webtoonId}&list_changed_episodes=true`).then(r => r.ok ? r.json() : { episodes: [] }),
          fetch(`/api/relationships?webtoon_id=${webtoonId}&meta=true`).then(r => r.ok ? r.json() : null),
        ]);

        // Auto-layout characters that have default position
        const positionedChars = autoLayout(charsRes);
        setCharacters(positionedChars);
        setRelationships(relsRes);
        setRelationshipTypes(typesRes);

        // Load episodes separately via supabase
        const episodesRes = await fetch(`/api/relationships/snapshots?webtoon_id=${webtoonId}&list_episodes=true`);
        if (episodesRes.ok) {
          const epData = await episodesRes.json();
          setEpisodes(epData.episodes || []);
          setChangedEpisodeIds(new Set(epData.changed_episode_ids || []));
        }

        // Get webtoon title
        if (webtoonRes?.webtoon_title) {
          setWebtoonTitle(webtoonRes.webtoon_title);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [webtoonId]);

  // Auto-layout: spread characters in a circle if all at origin
  function autoLayout(chars: CharacterNode[]): CharacterNode[] {
    const allAtOrigin = chars.every(
      (c) => c.position.x === 0 && c.position.y === 0 && c.position.z === 0
    );
    if (!allAtOrigin || chars.length === 0) return chars;

    const radius = Math.max(3, chars.length * 0.8);
    return chars.map((c, i) => {
      const angle = (i / chars.length) * Math.PI * 2;
      return {
        ...c,
        position: {
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius,
        },
      };
    });
  }

  // Handlers
  const handleSelectCharacter = useCallback((id: string | null) => {
    setSelectedCharacterId(id);
    if (id) setSelectedRelationshipId(null);
  }, []);

  const handleSelectRelationship = useCallback((id: string | null) => {
    setSelectedRelationshipId(id);
    if (id) setSelectedCharacterId(null);
  }, []);

  const handleCharacterDragEnd = useCallback(
    async (id: string, position: [number, number, number]) => {
      // Optimistic update
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, position: { x: position[0], y: position[1], z: position[2] } }
            : c
        )
      );
      // Save to DB
      try {
        await fetch('/api/relationships/position', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            character_id: id,
            position: { x: position[0], y: position[1], z: position[2] },
          }),
        });
      } catch (err) {
        console.error('Failed to save position:', err);
      }
    },
    []
  );

  const handleUpdateRelationship = useCallback(
    async (id: string, data: Partial<CharacterRelationship>) => {
      // Optimistic
      setRelationships((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...data } : r))
      );
      try {
        await fetch(`/api/relationships/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } catch (err) {
        console.error('Failed to update relationship:', err);
      }
    },
    []
  );

  const handleDeleteRelationship = useCallback(
    async (id: string) => {
      setRelationships((prev) => prev.filter((r) => r.id !== id));
      setSelectedRelationshipId(null);
      try {
        await fetch(`/api/relationships/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete relationship:', err);
      }
    },
    []
  );

  const handleCreateRelationship = useCallback(
    async (data: {
      character_a_id: string;
      character_b_id: string;
      relationship_type: string;
      label?: string;
      intensity?: number;
      tension?: number;
    }) => {
      try {
        const res = await fetch('/api/relationships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, webtoon_id: webtoonId }),
        });
        if (res.ok) {
          const newRel = await res.json();
          setRelationships((prev) => [...prev, newRel]);
        }
      } catch (err) {
        console.error('Failed to create relationship:', err);
      }
    },
    [webtoonId]
  );

  const handleUpdateCharacter = useCallback(
    async (id: string, data: Partial<CharacterNode>) => {
      setCharacters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data } : c))
      );
      try {
        await fetch('/api/relationships/position', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_id: id, ...data }),
        });
      } catch (err) {
        console.error('Failed to update character:', err);
      }
    },
    []
  );

  const handleEpisodeSelect = useCallback(
    async (episodeId: string | null) => {
      setCurrentEpisodeId(episodeId);
      if (!episodeId) {
        // Reload current relationships
        try {
          const res = await fetch(`/api/relationships?webtoon_id=${webtoonId}`);
          if (res.ok) setRelationships(await res.json());
        } catch {}
        return;
      }
      // Load snapshot for this episode
      try {
        const res = await fetch(
          `/api/relationships/snapshots?webtoon_id=${webtoonId}&episode_id=${episodeId}`
        );
        if (res.ok) {
          const snapshots = await res.json();
          if (snapshots.length > 0) {
            // Apply snapshot data to relationships
            setRelationships((prev) =>
              prev.map((rel) => {
                const snap = snapshots.find(
                  (s: { relationship_id: string }) => s.relationship_id === rel.id
                );
                if (snap) {
                  return {
                    ...rel,
                    relationship_type: snap.relationship_type,
                    label: snap.label,
                    direction: snap.direction,
                    intensity: snap.intensity,
                    tension: snap.tension,
                  };
                }
                return rel;
              })
            );
          }
        }
      } catch {}
    },
    [webtoonId]
  );

  const handleClose = useCallback(() => {
    setSelectedCharacterId(null);
    setSelectedRelationshipId(null);
  }, []);

  // Derived
  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) || null;
  const selectedRelationship = relationships.find((r) => r.id === selectedRelationshipId) || null;
  const characterRelationships = selectedCharacterId
    ? relationships.filter(
        (r) =>
          r.character_a_id === selectedCharacterId ||
          r.character_b_id === selectedCharacterId
      )
    : [];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-400 animate-pulse">관계도 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-slate-950">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 flex items-center px-4 z-20">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-white mr-3"
          onClick={() => router.push(`/webtoons/${webtoonId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          돌아가기
        </Button>
        <Network className="h-4 w-4 text-blue-400 mr-2" />
        <h1 className="text-sm font-semibold text-white">
          {webtoonTitle || '관계도'}
        </h1>
        <span className="ml-2 text-xs text-slate-500">
          캐릭터 {characters.length}명 · 관계 {relationships.length}개
        </span>
      </div>

      {/* 3D Canvas */}
      <div className="absolute inset-0 pt-12 pb-12">
        <Graph3DView
          characters={characters}
          relationships={relationships}
          selectedCharacterId={selectedCharacterId}
          selectedRelationshipId={selectedRelationshipId}
          onSelectCharacter={handleSelectCharacter}
          onSelectRelationship={handleSelectRelationship}
          onCharacterDragEnd={handleCharacterDragEnd}
        />
      </div>

      {/* Side Panel */}
      <div className="pt-12">
        <SidePanel
          selectedCharacter={selectedCharacter}
          characterRelationships={characterRelationships}
          selectedRelationship={selectedRelationship}
          allCharacters={characters}
          relationshipTypes={relationshipTypes}
          onClose={handleClose}
          onUpdateRelationship={handleUpdateRelationship}
          onDeleteRelationship={handleDeleteRelationship}
          onCreateRelationship={handleCreateRelationship}
          onUpdateCharacter={handleUpdateCharacter}
        />
      </div>

      {/* Timeline */}
      <TimelineSlider
        episodes={episodes}
        currentEpisodeId={currentEpisodeId}
        changedEpisodeIds={changedEpisodeIds}
        onEpisodeSelect={handleEpisodeSelect}
      />

      {/* Empty state */}
      {characters.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <Network className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              캐릭터가 없습니다. 먼저 캐릭터를 추가해주세요.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 pointer-events-auto"
              onClick={() => router.push(`/webtoons/${webtoonId}/characters`)}
            >
              캐릭터 관리로 이동
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
