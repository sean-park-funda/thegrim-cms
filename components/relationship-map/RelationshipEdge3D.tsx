'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, Line } from '@react-three/drei';
import * as THREE from 'three';

interface RelationshipEdge3DProps {
  id: string;
  startPosition: [number, number, number];
  endPosition: [number, number, number];
  relationshipType: string;
  label?: string;
  color: string;
  intensity: number; // -10 to +10
  tension: number; // 0 to 10
  direction: 'mutual' | 'a_to_b' | 'b_to_a';
  isSelected: boolean;
  isHighlighted: boolean;
  isGhost?: boolean; // What-if mode
  onClick: (id: string) => void;
}

export default function RelationshipEdge3D({
  id,
  startPosition,
  endPosition,
  relationshipType,
  label,
  color,
  intensity,
  tension,
  direction,
  isSelected,
  isHighlighted,
  isGhost = false,
  onClick,
}: RelationshipEdge3DProps) {
  const lineRef = useRef<THREE.Line>(null);
  const labelRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const edgeColor = new THREE.Color(color);
  const lineWidth = Math.max(1, Math.abs(intensity) * 0.3 + 1);

  // Midpoint for label
  const midPoint = useMemo<[number, number, number]>(() => [
    (startPosition[0] + endPosition[0]) / 2,
    (startPosition[1] + endPosition[1]) / 2 + 0.3,
    (startPosition[2] + endPosition[2]) / 2,
  ], [startPosition, endPosition]);

  // Create curve points for the line
  const points = useMemo(() => {
    const start = new THREE.Vector3(...startPosition);
    const end = new THREE.Vector3(...endPosition);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Slight arc upward
    mid.y += 0.2;

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return curve.getPoints(20);
  }, [startPosition, endPosition]);

  const linePoints = useMemo(() => {
    return points.map(p => [p.x, p.y, p.z] as [number, number, number]);
  }, [points]);

  // Arrow points for directional relationships
  const arrowPoints = useMemo(() => {
    if (direction === 'mutual') return null;

    const targetIdx = direction === 'a_to_b' ? points.length - 3 : 2;
    const tipIdx = direction === 'a_to_b' ? points.length - 1 : 0;

    const target = points[targetIdx];
    const tip = points[tipIdx];
    if (!target || !tip) return null;

    const dir = new THREE.Vector3().subVectors(tip, target).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.15);

    const arrowBase = new THREE.Vector3().addVectors(tip, dir.clone().multiplyScalar(-0.3));

    return [
      [arrowBase.x + perp.x, arrowBase.y + perp.y, arrowBase.z + perp.z] as [number, number, number],
      [tip.x, tip.y, tip.z] as [number, number, number],
      [arrowBase.x - perp.x, arrowBase.y - perp.y, arrowBase.z - perp.z] as [number, number, number],
    ];
  }, [direction, points]);

  // Tension animation + distance-independent label scaling
  useFrame((state) => {
    timeRef.current = state.clock.elapsedTime;
    if (labelRef.current) {
      const dist = state.camera.position.distanceTo(
        new THREE.Vector3(...midPoint)
      );
      const s = Math.min(Math.max(dist * 0.07, 0.5), 2.5);
      labelRef.current.scale.setScalar(s);
    }
  });

  const opacity = isGhost ? 0.4 : isSelected || isHighlighted ? 1.0 : 0.6;
  const dashSize = direction !== 'mutual' ? 0.15 : 0;

  return (
    <group>
      {/* Main line */}
      <Line
        points={linePoints}
        color={edgeColor}
        lineWidth={isSelected ? lineWidth + 1.5 : lineWidth}
        transparent
        opacity={opacity}
        dashed={isGhost || direction !== 'mutual'}
        dashSize={isGhost ? 0.1 : dashSize}
        dashScale={2}
        gapSize={isGhost ? 0.1 : 0.1}
      />

      {/* Arrow head for directional */}
      {arrowPoints && (
        <Line
          points={arrowPoints}
          color={edgeColor}
          lineWidth={lineWidth + 1}
          transparent
          opacity={opacity}
        />
      )}

      {/* Label at midpoint — distance-independent size */}
      {(isSelected || isHighlighted || label) && (
        <group ref={labelRef} position={midPoint}>
          <Billboard>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onClick(id);
              }}
              onPointerOver={() => {
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'auto';
              }}
            >
              <planeGeometry args={[2.4, 0.6]} />
              <meshBasicMaterial
                color={isSelected ? '#ffffff' : '#f1f5f9'}
                transparent
                opacity={isSelected ? 0.95 : 0.85}
              />
            </mesh>
            <Text
              fontSize={0.26}
              color={color}
              anchorX="center"
              anchorY="middle"
              font={undefined}
            >
              {label || relationshipType}
            </Text>
            {/* Tension indicator */}
            {tension > 5 && (
              <Text
                fontSize={0.16}
                color="#ef4444"
                anchorX="center"
                anchorY="top"
                position={[0, -0.36, 0]}
                font={undefined}
              >
                ⚡ 긴장도 {tension}
              </Text>
            )}
          </Billboard>
        </group>
      )}

      {/* Invisible click area */}
      <mesh
        position={midPoint}
        onClick={(e) => {
          e.stopPropagation();
          onClick(id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
        visible={false}
      >
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}
