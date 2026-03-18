'use client';

import { useState } from 'react';
import { X, Plus, Trash2, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CharacterNode, CharacterRelationship, RelationshipType } from '@/lib/types/relationship';

interface SidePanelProps {
  // Character detail
  selectedCharacter: CharacterNode | null;
  characterRelationships: CharacterRelationship[];
  // Relationship edit
  selectedRelationship: CharacterRelationship | null;
  // Data
  allCharacters: CharacterNode[];
  relationshipTypes: RelationshipType[];
  // Actions
  onClose: () => void;
  onUpdateRelationship: (id: string, data: Partial<CharacterRelationship>) => void;
  onDeleteRelationship: (id: string) => void;
  onCreateRelationship: (data: {
    character_a_id: string;
    character_b_id: string;
    relationship_type: string;
    label?: string;
    intensity?: number;
    tension?: number;
  }) => void;
  onUpdateCharacter: (id: string, data: Partial<CharacterNode>) => void;
}

export default function SidePanel({
  selectedCharacter,
  characterRelationships,
  selectedRelationship,
  allCharacters,
  relationshipTypes,
  onClose,
  onUpdateRelationship,
  onDeleteRelationship,
  onCreateRelationship,
  onUpdateCharacter,
}: SidePanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRelTarget, setNewRelTarget] = useState('');
  const [newRelType, setNewRelType] = useState('friend');
  const [editLabel, setEditLabel] = useState('');
  const [editIntensity, setEditIntensity] = useState(5);
  const [editTension, setEditTension] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  // Show nothing if nothing selected
  if (!selectedCharacter && !selectedRelationship) return null;

  // Character Detail Panel
  if (selectedCharacter) {
    const connectedRels = characterRelationships;
    return (
      <div className="absolute right-0 top-0 bottom-12 w-80 bg-white/95 backdrop-blur-sm border-l border-slate-200 overflow-y-auto z-20">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">{selectedCharacter.name}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Character info */}
          <div className="space-y-3 mb-6">
            {selectedCharacter.faction && (
              <div>
                <span className="text-xs text-slate-400">소속</span>
                <p className="text-sm text-slate-700">{selectedCharacter.faction}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-slate-400">역할</span>
              <Select
                value={selectedCharacter.role_type}
                onValueChange={(val) =>
                  onUpdateCharacter(selectedCharacter.id, {
                    role_type: val as CharacterNode['role_type'],
                  })
                }
              >
                <SelectTrigger className="h-8 mt-1 bg-slate-50 border-slate-300 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="protagonist">주인공</SelectItem>
                  <SelectItem value="antagonist">적대자</SelectItem>
                  <SelectItem value="supporting">조연</SelectItem>
                  <SelectItem value="minor">단역</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedCharacter.personality_tags.length > 0 && (
              <div>
                <span className="text-xs text-slate-400">성격 태그</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedCharacter.personality_tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedCharacter.description && (
              <div>
                <span className="text-xs text-slate-400">설명</span>
                <p className="text-xs text-slate-600 mt-1">{selectedCharacter.description}</p>
              </div>
            )}
          </div>

          {/* Connected relationships */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-600">관계 목록</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="h-3 w-3 mr-1" />
                추가
              </Button>
            </div>

            {/* Add relationship form */}
            {showAddForm && (
              <Card className="mb-3 bg-slate-50 border-slate-300">
                <CardContent className="p-3 space-y-2">
                  <Select value={newRelTarget} onValueChange={setNewRelTarget}>
                    <SelectTrigger className="h-8 bg-slate-100 border-slate-300 text-xs">
                      <SelectValue placeholder="상대 캐릭터" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCharacters
                        .filter((c) => c.id !== selectedCharacter.id)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select value={newRelType} onValueChange={setNewRelType}>
                    <SelectTrigger className="h-8 bg-slate-100 border-slate-300 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {relationshipTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          <span style={{ color: rt.color }}>●</span> {rt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs"
                    disabled={!newRelTarget}
                    onClick={() => {
                      onCreateRelationship({
                        character_a_id: selectedCharacter.id,
                        character_b_id: newRelTarget,
                        relationship_type: newRelType,
                      });
                      setShowAddForm(false);
                      setNewRelTarget('');
                    }}
                  >
                    관계 추가
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Relationship list */}
            <div className="space-y-1.5">
              {connectedRels.map((rel) => {
                const otherChar =
                  rel.character_a_id === selectedCharacter.id
                    ? allCharacters.find((c) => c.id === rel.character_b_id)
                    : allCharacters.find((c) => c.id === rel.character_a_id);
                const typeInfo = relationshipTypes.find(
                  (rt) => rt.id === rel.relationship_type
                );
                return (
                  <div
                    key={rel.id}
                    className="flex items-center gap-2 p-2 rounded bg-slate-50/50 hover:bg-slate-50 cursor-pointer group"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: typeInfo?.color || rel.color }}
                    />
                    <span className="text-xs text-slate-600 flex-1 truncate">
                      {otherChar?.name || '?'} — {typeInfo?.label || rel.relationship_type}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {rel.intensity > 0 ? '+' : ''}{rel.intensity}
                    </span>
                  </div>
                );
              })}
              {connectedRels.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  아직 관계가 없습니다
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Relationship Edit Panel
  if (selectedRelationship) {
    const charA = allCharacters.find(
      (c) => c.id === selectedRelationship.character_a_id
    );
    const charB = allCharacters.find(
      (c) => c.id === selectedRelationship.character_b_id
    );
    const currentType = relationshipTypes.find(
      (rt) => rt.id === selectedRelationship.relationship_type
    );

    return (
      <div className="absolute right-0 top-0 bottom-12 w-80 bg-white/95 backdrop-blur-sm border-l border-slate-200 overflow-y-auto z-20">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              {charA?.name} ↔ {charB?.name}
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            {/* Relationship type */}
            <div>
              <label className="text-xs text-slate-400">관계 유형</label>
              <Select
                value={selectedRelationship.relationship_type}
                onValueChange={(val) => {
                  const typeInfo = relationshipTypes.find((rt) => rt.id === val);
                  onUpdateRelationship(selectedRelationship.id, {
                    relationship_type: val,
                    color: typeInfo?.color || selectedRelationship.color,
                  });
                }}
              >
                <SelectTrigger className="mt-1 bg-slate-50 border-slate-300 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {relationshipTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      <span style={{ color: rt.color }}>●</span> {rt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div>
              <label className="text-xs text-slate-400">라벨 (자유 입력)</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm text-slate-900"
                placeholder="예: 소꿉친구, 첫사랑"
                defaultValue={selectedRelationship.label || ''}
                onBlur={(e) =>
                  onUpdateRelationship(selectedRelationship.id, {
                    label: e.target.value || undefined,
                  })
                }
              />
            </div>

            {/* Direction */}
            <div>
              <label className="text-xs text-slate-400">방향</label>
              <Select
                value={selectedRelationship.direction}
                onValueChange={(val) =>
                  onUpdateRelationship(selectedRelationship.id, {
                    direction: val as 'mutual' | 'a_to_b' | 'b_to_a',
                  })
                }
              >
                <SelectTrigger className="mt-1 bg-slate-50 border-slate-300 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mutual">양방향</SelectItem>
                  <SelectItem value="a_to_b">
                    {charA?.name} → {charB?.name}
                  </SelectItem>
                  <SelectItem value="b_to_a">
                    {charB?.name} → {charA?.name}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Intensity slider */}
            <div>
              <label className="text-xs text-slate-400">
                감정 강도: {selectedRelationship.intensity > 0 ? '+' : ''}
                {selectedRelationship.intensity}
              </label>
              <input
                type="range"
                min={-10}
                max={10}
                value={selectedRelationship.intensity}
                onChange={(e) =>
                  onUpdateRelationship(selectedRelationship.id, {
                    intensity: parseInt(e.target.value),
                  })
                }
                className="w-full mt-1 accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>-10 적대</span>
                <span>0 중립</span>
                <span>+10 호감</span>
              </div>
            </div>

            {/* Tension slider */}
            <div>
              <label className="text-xs text-slate-400">
                긴장도: {selectedRelationship.tension}
              </label>
              <input
                type="range"
                min={0}
                max={10}
                value={selectedRelationship.tension}
                onChange={(e) =>
                  onUpdateRelationship(selectedRelationship.id, {
                    tension: parseInt(e.target.value),
                  })
                }
                className="w-full mt-1 accent-red-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0 안정</span>
                <span>10 폭발직전</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-slate-400">메모</label>
              <Textarea
                className="mt-1 bg-slate-50 border-slate-300 text-sm text-slate-900 min-h-[60px]"
                placeholder="관계에 대한 메모..."
                defaultValue={selectedRelationship.notes || ''}
                onBlur={(e) =>
                  onUpdateRelationship(selectedRelationship.id, {
                    notes: e.target.value || undefined,
                  })
                }
              />
            </div>

            {/* Delete */}
            <Button
              variant="ghost"
              className="w-full text-red-400 hover:text-red-300 hover:bg-red-950/30 text-sm"
              onClick={() => {
                if (confirm('이 관계를 삭제할까요?')) {
                  onDeleteRelationship(selectedRelationship.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              관계 삭제
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
