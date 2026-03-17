'use client';

import { useRef, useState, useMemo } from 'react';
import { useFrame, useLoader, ThreeEvent } from '@react-three/fiber';
import { Billboard, Text, Ring } from '@react-three/drei';
import * as THREE from 'three';

interface CharacterNode3DProps {
  id: string;
  name: string;
  position: [number, number, number];
  color: string;
  roleType: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  faction?: string;
  profileImageUrl?: string;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: (id: string) => void;
  onDragEnd: (id: string, position: [number, number, number]) => void;
}

const ROLE_SCALE: Record<string, number> = {
  protagonist: 1.5,
  antagonist: 1.3,
  supporting: 1.0,
  minor: 0.7,
};

export default function CharacterNode3D({
  id,
  name,
  position,
  color,
  roleType,
  faction,
  profileImageUrl,
  isSelected,
  isHighlighted,
  onClick,
  onDragEnd,
}: CharacterNode3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<THREE.Vector3 | null>(null);

  const scale = ROLE_SCALE[roleType] || 1.0;
  const nodeColor = new THREE.Color(color);

  // Load profile image as texture
  const texture = useMemo(() => {
    if (!profileImageUrl) return null;
    const loader = new THREE.TextureLoader();
    try {
      return loader.load(profileImageUrl);
    } catch {
      return null;
    }
  }, [profileImageUrl]);

  // Glow animation
  useFrame((state) => {
    if (glowRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 1;
      if (isSelected || hovered) {
        glowRef.current.scale.setScalar(scale * 1.4 * pulse);
        (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.3;
      } else {
        glowRef.current.scale.setScalar(scale * 1.2);
        (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.1;
      }
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(true);
    dragStart.current = new THREE.Vector3(...position);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (dragging && meshRef.current) {
      const pos = meshRef.current.position;
      if (dragStart.current && dragStart.current.distanceTo(pos) < 0.3) {
        onClick(id);
      } else {
        onDragEnd(id, [pos.x, pos.y, pos.z]);
      }
    }
    setDragging(false);
    dragStart.current = null;
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    if (meshRef.current && e.point) {
      meshRef.current.position.copy(e.point);
    }
  };

  const opacity = isHighlighted || isSelected ? 1.0 : hovered ? 0.9 : 0.75;

  return (
    <group position={position}>
      {/* Glow ring */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* Main sphere */}
      <mesh
        ref={meshRef}
        scale={scale}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.45, 32, 32]} />
        {texture ? (
          <meshStandardMaterial
            map={texture}
            emissive={isSelected ? nodeColor : new THREE.Color('#000000')}
            emissiveIntensity={isSelected ? 0.3 : 0}
            transparent
            opacity={opacity}
          />
        ) : (
          <meshStandardMaterial
            color={nodeColor}
            emissive={isSelected ? nodeColor : new THREE.Color('#000000')}
            emissiveIntensity={isSelected ? 0.5 : 0.1}
            transparent
            opacity={opacity}
            roughness={0.3}
            metalness={0.1}
          />
        )}
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <Billboard>
          <Ring args={[0.55 * scale, 0.62 * scale, 64]} rotation={[0, 0, 0]}>
            <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
          </Ring>
        </Billboard>
      )}

      {/* Name label */}
      <Billboard position={[0, 0.7 * scale, 0]}>
        <Text
          fontSize={0.2}
          color={isSelected || hovered ? '#ffffff' : '#e2e8f0'}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#000000"
          font={undefined}
        >
          {name}
        </Text>
        {(hovered || isSelected) && faction && (
          <Text
            fontSize={0.12}
            color="#94a3b8"
            anchorX="center"
            anchorY="top"
            position={[0, -0.05, 0]}
            outlineWidth={0.01}
            outlineColor="#000000"
            font={undefined}
          >
            {faction}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
