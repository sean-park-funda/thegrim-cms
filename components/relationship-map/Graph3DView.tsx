'use client';

import { Suspense, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera, Environment } from '@react-three/drei';
import CharacterNode3D from './CharacterNode3D';
import RelationshipEdge3D from './RelationshipEdge3D';
import type { CharacterNode, CharacterRelationship } from '@/lib/types/relationship';

interface Graph3DViewProps {
  characters: CharacterNode[];
  relationships: CharacterRelationship[];
  selectedCharacterId: string | null;
  selectedRelationshipId: string | null;
  whatIfResults?: Array<{
    relationship_id: string;
    suggested_type: string;
    suggested_intensity: number;
    suggested_tension: number;
  }> | null;
  onSelectCharacter: (id: string | null) => void;
  onSelectRelationship: (id: string | null) => void;
  onCharacterDragEnd: (id: string, position: [number, number, number]) => void;
}

function SceneContent({
  characters,
  relationships,
  selectedCharacterId,
  selectedRelationshipId,
  whatIfResults,
  onSelectCharacter,
  onSelectRelationship,
  onCharacterDragEnd,
}: Graph3DViewProps) {
  // Find connected character IDs for highlighting
  const highlightedCharacterIds = new Set<string>();
  const highlightedRelationshipIds = new Set<string>();

  if (selectedCharacterId) {
    relationships.forEach((rel) => {
      if (
        rel.character_a_id === selectedCharacterId ||
        rel.character_b_id === selectedCharacterId
      ) {
        highlightedRelationshipIds.add(rel.id);
        highlightedCharacterIds.add(rel.character_a_id);
        highlightedCharacterIds.add(rel.character_b_id);
      }
    });
  }

  if (selectedRelationshipId) {
    const rel = relationships.find((r) => r.id === selectedRelationshipId);
    if (rel) {
      highlightedCharacterIds.add(rel.character_a_id);
      highlightedCharacterIds.add(rel.character_b_id);
    }
  }

  const getCharacterPosition = useCallback(
    (charId: string): [number, number, number] => {
      const char = characters.find((c) => c.id === charId);
      if (char) {
        return [char.position.x, char.position.y, char.position.z];
      }
      return [0, 0, 0];
    },
    [characters]
  );

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5, 15]} fov={60} />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={50}
        makeDefault
      />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} />
      <directionalLight position={[0, 10, 5]} intensity={0.5} />

      {/* Background */}
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
      <color attach="background" args={['#0a0a1a']} />
      <fog attach="fog" args={['#0a0a1a', 30, 60]} />

      {/* Grid helper */}
      <gridHelper args={[40, 40, '#1e293b', '#0f172a']} position={[0, -2, 0]} />

      {/* Relationship edges */}
      {relationships.map((rel) => {
        const whatIf = whatIfResults?.find((w) => w.relationship_id === rel.id);
        return (
          <RelationshipEdge3D
            key={rel.id}
            id={rel.id}
            startPosition={getCharacterPosition(rel.character_a_id)}
            endPosition={getCharacterPosition(rel.character_b_id)}
            relationshipType={whatIf?.suggested_type || rel.relationship_type}
            label={rel.label || undefined}
            color={rel.color}
            intensity={whatIf?.suggested_intensity ?? rel.intensity}
            tension={whatIf?.suggested_tension ?? rel.tension}
            direction={rel.direction}
            isSelected={selectedRelationshipId === rel.id}
            isHighlighted={highlightedRelationshipIds.has(rel.id)}
            isGhost={!!whatIf}
            onClick={(id) => {
              onSelectRelationship(id);
              onSelectCharacter(null);
            }}
          />
        );
      })}

      {/* Character nodes */}
      {characters.map((char) => (
        <CharacterNode3D
          key={char.id}
          id={char.id}
          name={char.name}
          position={[char.position.x, char.position.y, char.position.z]}
          color={char.color}
          roleType={char.role_type}
          faction={char.faction || undefined}
          profileImageUrl={char.profile_image_url || undefined}
          isSelected={selectedCharacterId === char.id}
          isHighlighted={highlightedCharacterIds.has(char.id)}
          onClick={(id) => {
            onSelectCharacter(id);
            onSelectRelationship(null);
          }}
          onDragEnd={onCharacterDragEnd}
        />
      ))}
    </>
  );
}

export default function Graph3DView(props: Graph3DViewProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        onClick={() => {
          // Deselect when clicking empty space
          // This is handled by the scene's onClick bubbling
        }}
      >
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
