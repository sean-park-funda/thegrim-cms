export interface RelationshipType {
  id: string;
  label: string;
  color: string;
  icon: string;
  category: 'positive' | 'negative' | 'neutral' | 'family';
  order_index: number;
}

export interface CharacterRelationship {
  id: string;
  webtoon_id: string;
  character_a_id: string;
  character_b_id: string;
  relationship_type: string;
  label?: string;
  direction: 'mutual' | 'a_to_b' | 'b_to_a';
  intensity: number; // -10 to +10
  tension: number; // 0 to 10
  color: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  character_a?: CharacterNode;
  character_b?: CharacterNode;
  type_info?: RelationshipType;
}

export interface CharacterNode {
  id: string;
  webtoon_id: string;
  name: string;
  description?: string;
  folder_id?: string;
  personality_tags: string[];
  faction?: string;
  role_type: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  profile_image_url?: string;
  color: string;
  position: { x: number; y: number; z: number };
  created_at: string;
  updated_at: string;
  character_sheets?: Array<{
    id: string;
    file_path: string;
    thumbnail_path?: string;
    file_name: string;
  }>;
}

export interface RelationshipSnapshot {
  id: string;
  relationship_id: string;
  episode_id: string;
  relationship_type: string;
  label?: string;
  direction: string;
  intensity: number;
  tension: number;
  change_reason?: string;
  created_at: string;
}

export interface WhatIfResult {
  affected_relationships: Array<{
    relationship_id: string;
    character_a_name: string;
    character_b_name: string;
    current_type: string;
    suggested_type: string;
    current_intensity: number;
    suggested_intensity: number;
    current_tension: number;
    suggested_tension: number;
    reason: string;
  }>;
  narrative_summary: string;
}
