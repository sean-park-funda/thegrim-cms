'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CharacterWithSheets } from '@/lib/supabase';
import { createCharacter, updateCharacter } from '@/lib/api/characters';

interface CharacterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webtoonId: string;
  character: CharacterWithSheets | null;
  onSaved: () => void;
  initialName?: string;
  initialDescription?: string;
}

export function CharacterEditDialog({
  open,
  onOpenChange,
  webtoonId,
  character,
  onSaved,
  initialName,
  initialDescription,
}: CharacterEditDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const isEditing = !!character;

  useEffect(() => {
    if (open) {
      if (character) {
        setFormData({
          name: character.name,
          description: character.description || '',
        });
      } else {
        setFormData({
          name: initialName || '',
          description: initialDescription || '',
        });
      }
    }
  }, [open, character, initialName, initialDescription]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('캐릭터 이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      let createdCharacterId: string | null = null;
      
      if (isEditing) {
        await updateCharacter(character.id, {
          name: formData.name,
          description: formData.description || undefined,
        });
      } else {
        const createdCharacter = await createCharacter({
          webtoon_id: webtoonId,
          name: formData.name,
          description: formData.description || undefined,
        });
        createdCharacterId = createdCharacter.id;
      }

      // 새 캐릭터 생성 시 이미지도 생성
      if (!isEditing && createdCharacterId) {
        try {
          const imageRes = await fetch(`/api/characters/${createdCharacterId}/generate-image`, {
            method: 'POST',
          });
          
          if (!imageRes.ok) {
            const errorData = await imageRes.json().catch(() => ({}));
            console.warn('캐릭터 이미지 생성 실패 (계속 진행):', errorData.error || '알 수 없는 오류');
            // 이미지 생성 실패해도 캐릭터는 저장되었으므로 계속 진행
          }
        } catch (imageError) {
          console.warn('캐릭터 이미지 생성 중 오류 (계속 진행):', imageError);
          // 이미지 생성 실패해도 캐릭터는 저장되었으므로 계속 진행
        }
      }

      onSaved();
    } catch (error) {
      console.error('캐릭터 저장 실패:', error);
      alert(isEditing ? '캐릭터 수정에 실패했습니다.' : '캐릭터 생성에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? '캐릭터 수정' : '새 캐릭터 추가'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '캐릭터 정보를 수정합니다.' : '새로운 캐릭터를 추가합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">이름 *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="캐릭터 이름을 입력하세요"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">설명</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="캐릭터에 대한 간단한 설명을 입력하세요 (선택)"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : isEditing ? '수정' : '생성'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

