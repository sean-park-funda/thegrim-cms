'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, X, ImageIcon, Check } from 'lucide-react';
import { CharacterWithSheets, CharacterSheet } from '@/lib/supabase';
import { getCharactersByWebtoon } from '@/lib/api/characters';
import { cn } from '@/lib/utils';

export interface SelectedCharacterSheet {
  characterId: string;
  characterName: string;
  sheetId: string;
  sheetPath: string;
  sheetName: string;
}

interface CharacterSheetSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webtoonId?: string;
  selectedSheets: SelectedCharacterSheet[];
  onSheetsChange: (sheets: SelectedCharacterSheet[]) => void;
}

export function CharacterSheetSelectDialog({
  open,
  onOpenChange,
  webtoonId,
  selectedSheets,
  onSheetsChange,
}: CharacterSheetSelectDialogProps) {
  const [characters, setCharacters] = useState<CharacterWithSheets[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(new Set());

  // 캐릭터 목록 로드
  useEffect(() => {
    const loadCharacters = async () => {
      if (!open || !webtoonId) return;

      setLoading(true);
      try {
        const data = await getCharactersByWebtoon(webtoonId);
        // 캐릭터시트가 있는 캐릭터만 필터링
        const charactersWithSheets = data.filter(
          (char) => char.character_sheets && char.character_sheets.length > 0
        );
        setCharacters(charactersWithSheets);

        // 첫 번째 캐릭터 선택
        if (charactersWithSheets.length > 0 && !selectedCharacterId) {
          setSelectedCharacterId(charactersWithSheets[0].id);
        }
      } catch (error) {
        console.error('캐릭터 목록 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCharacters();
  }, [open, webtoonId, selectedCharacterId]);

  // 선택된 캐릭터의 캐릭터시트 목록
  const selectedCharacter = characters.find((char) => char.id === selectedCharacterId);
  const availableSheets = selectedCharacter?.character_sheets || [];

  // 캐릭터시트 선택/해제
  const handleSheetToggle = (sheet: CharacterSheet) => {
    setSelectedSheetIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sheet.id)) {
        newSet.delete(sheet.id);
      } else {
        newSet.add(sheet.id);
      }
      return newSet;
    });
  };

  // 선택된 캐릭터시트 추가
  const handleAddSelectedSheets = () => {
    if (!selectedCharacter || selectedSheetIds.size === 0) return;

    const newSheets: SelectedCharacterSheet[] = [];
    selectedSheetIds.forEach((sheetId) => {
      const sheet = availableSheets.find((s) => s.id === sheetId);
      if (sheet) {
        // 이미 선택된 시트인지 확인
        const isAlreadySelected = selectedSheets.some((s) => s.sheetId === sheetId);
        if (!isAlreadySelected) {
          newSheets.push({
            characterId: selectedCharacter.id,
            characterName: selectedCharacter.name,
            sheetId: sheet.id,
            sheetPath: sheet.file_path,
            sheetName: sheet.file_name,
          });
        }
      }
    });

    if (newSheets.length > 0) {
      onSheetsChange([...selectedSheets, ...newSheets]);
      setSelectedSheetIds(new Set());
    }
  };

  // 선택된 캐릭터시트 제거
  const handleRemoveSheet = (sheetId: string) => {
    onSheetsChange(selectedSheets.filter((s) => s.sheetId !== sheetId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>캐릭터시트 선택</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
            {/* 왼쪽: 캐릭터 목록 */}
            <div className="flex flex-col border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/50">
                <h3 className="text-sm font-medium">캐릭터 선택</h3>
              </div>
              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : characters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                    <p className="text-sm">등록된 캐릭터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {characters.map((character) => (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => {
                          setSelectedCharacterId(character.id);
                          setSelectedSheetIds(new Set());
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-md transition-colors',
                          selectedCharacterId === character.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{character.name}</span>
                          <span className="text-xs opacity-70">
                            {character.character_sheets?.length || 0}개
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* 오른쪽: 캐릭터시트 목록 */}
            <div className="flex flex-col border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/50">
                <h3 className="text-sm font-medium">
                  {selectedCharacter ? `${selectedCharacter.name} - 캐릭터시트` : '캐릭터를 선택하세요'}
                </h3>
              </div>
              <ScrollArea className="flex-1">
                {selectedCharacter && availableSheets.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-3">
                    {availableSheets.map((sheet) => {
                      const isSelected = selectedSheetIds.has(sheet.id);
                      const isAlreadyAdded = selectedSheets.some((s) => s.sheetId === sheet.id);

                      return (
                        <div
                          key={sheet.id}
                          className={cn(
                            'relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all group',
                            isSelected
                              ? 'ring-2 ring-primary ring-offset-2'
                              : isAlreadyAdded
                                ? 'opacity-50 ring-2 ring-muted'
                                : 'hover:ring-2 hover:ring-primary/50 hover:ring-offset-1'
                          )}
                          onClick={() => !isAlreadyAdded && handleSheetToggle(sheet)}
                        >
                          <img
                            src={sheet.file_path}
                            alt={sheet.file_name}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <div className="bg-primary rounded-full p-1">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                          {isAlreadyAdded && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-white text-xs font-medium">추가됨</span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-white text-xs truncate">{sheet.file_name}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                    <p className="text-sm">
                      {selectedCharacter ? '등록된 캐릭터시트가 없습니다.' : '캐릭터를 선택하세요'}
                    </p>
                  </div>
                )}
              </ScrollArea>
              {selectedCharacter && selectedSheetIds.size > 0 && (
                <div className="px-3 py-2 border-t">
                  <Button
                    onClick={handleAddSelectedSheets}
                    size="sm"
                    className="w-full"
                    disabled={selectedSheetIds.size === 0}
                  >
                    선택한 캐릭터시트 추가 ({selectedSheetIds.size}개)
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* 하단: 선택된 캐릭터시트 목록 */}
          {selectedSheets.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/50">
                <h3 className="text-sm font-medium">선택된 캐릭터시트 ({selectedSheets.length}개)</h3>
              </div>
              <ScrollArea className="max-h-[200px]">
                <div className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {selectedSheets.map((sheet) => (
                      <div
                        key={sheet.sheetId}
                        className="relative group flex items-center gap-2 px-3 py-2 bg-muted rounded-lg"
                      >
                        <img
                          src={sheet.sheetPath}
                          alt={sheet.sheetName}
                          className="w-10 h-10 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{sheet.characterName}</p>
                          <p className="text-xs text-muted-foreground truncate">{sheet.sheetName}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveSheet(sheet.sheetId)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

