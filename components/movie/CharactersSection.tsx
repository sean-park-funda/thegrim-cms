'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Check, Plus, Trash2, Upload } from 'lucide-react';

export interface CharacterData {
  name: string;
  description: string;
  image_path?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

interface CharactersSectionProps {
  characters: CharacterData[];
  saving: boolean;
  disabled?: boolean;
  onUpdateCharacter: (index: number, field: 'name' | 'description', value: string) => void;
  onAddCharacter: () => void;
  onRemoveCharacter: (index: number) => void;
  onImageUpload: (index: number, file: File) => void;
  onSave: () => void;
  onSkip: () => void;
}

export function CharactersSection({
  characters,
  saving,
  disabled = false,
  onUpdateCharacter,
  onAddCharacter,
  onRemoveCharacter,
  onImageUpload,
  onSave,
  onSkip,
}: CharactersSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">등장인물</CardTitle>
            <CardDescription className="text-xs">
              등장인물의 이름과 외모 설명을 입력하세요.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            disabled={saving || disabled}
            className="text-muted-foreground text-xs"
          >
            건너뛰기 →
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {characters.map((char, index) => (
          <Card key={index} className="p-3">
            <div className="flex gap-3">
              {/* 이미지 업로드 영역 */}
              <div className="flex-shrink-0">
                <label className="cursor-pointer">
                  <div className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                    {char.imageBase64 ? (
                      <img
                        src={`data:${char.imageMimeType};base64,${char.imageBase64}`}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : char.image_path ? (
                      <img
                        src={char.image_path}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-1">
                        <Upload className="h-4 w-4 mx-auto text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">이미지</span>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={disabled}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImageUpload(index, file);
                    }}
                  />
                </label>
              </div>

              {/* 정보 입력 영역 */}
              <div className="flex-1 space-y-2">
                <Input
                  value={char.name}
                  onChange={(e) => onUpdateCharacter(index, 'name', e.target.value)}
                  placeholder="캐릭터 이름 *"
                  disabled={disabled}
                  className="h-8 text-sm"
                />
                <Textarea
                  value={char.description}
                  onChange={(e) => onUpdateCharacter(index, 'description', e.target.value)}
                  placeholder="외모 설명 (예: 검은 단발머리, 청재킷을 입은 20대 여성)"
                  className="min-h-[50px] text-sm resize-none"
                  disabled={disabled}
                />
              </div>

              {/* 삭제 버튼 */}
              {characters.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive h-8 w-8"
                  onClick={() => onRemoveCharacter(index)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}

        <Button variant="outline" onClick={onAddCharacter} className="w-full" size="sm" disabled={disabled}>
          <Plus className="h-4 w-4 mr-2" />
          등장인물 추가
        </Button>

        <div className="flex justify-end">
          <Button
            onClick={onSave}
            disabled={saving || !characters.some((c) => c.name.trim()) || disabled}
            size="sm"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                저장
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
