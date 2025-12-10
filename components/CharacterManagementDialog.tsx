'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, User, Edit, Trash2, Image, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Webtoon, CharacterWithSheets } from '@/lib/supabase';
import { getCharactersByWebtoon, deleteCharacter } from '@/lib/api/characters';
import { CharacterEditDialog } from './CharacterEditDialog';
import { CharacterSheetDialog } from './CharacterSheetDialog';
import { useStore } from '@/lib/store/useStore';
import { canCreateContent, canEditContent, canDeleteContent } from '@/lib/utils/permissions';

interface CharacterManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webtoon: Webtoon;
}

export function CharacterManagementDialog({
  open,
  onOpenChange,
  webtoon,
}: CharacterManagementDialogProps) {
  const { profile } = useStore();
  const [characters, setCharacters] = useState<CharacterWithSheets[]>([]);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterWithSheets | null>(null);
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterWithSheets | null>(null);

  const loadCharacters = useCallback(async () => {
    if (!webtoon.id) return;
    try {
      setLoading(true);
      const data = await getCharactersByWebtoon(webtoon.id);
      setCharacters(data);
    } catch (error) {
      console.error('캐릭터 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [webtoon.id]);

  useEffect(() => {
    if (open) {
      loadCharacters();
    }
  }, [open, loadCharacters]);

  const handleCreateCharacter = () => {
    setEditingCharacter(null);
    setEditDialogOpen(true);
  };

  const handleEditCharacter = (character: CharacterWithSheets) => {
    setEditingCharacter(character);
    setEditDialogOpen(true);
  };

  const handleDeleteCharacter = async (character: CharacterWithSheets) => {
    if (!confirm(`"${character.name}" 캐릭터를 삭제하시겠습니까?\n관련된 모든 캐릭터 시트도 함께 삭제됩니다.`)) {
      return;
    }
    try {
      await deleteCharacter(character.id);
      await loadCharacters();
    } catch (error) {
      console.error('캐릭터 삭제 실패:', error);
      alert('캐릭터 삭제에 실패했습니다.');
    }
  };

  const handleManageSheets = (character: CharacterWithSheets) => {
    setSelectedCharacter(character);
    setSheetDialogOpen(true);
  };

  const handleCharacterSaved = () => {
    setEditDialogOpen(false);
    loadCharacters();
  };

  const handleSheetDialogClose = () => {
    setSheetDialogOpen(false);
    loadCharacters(); // 시트가 변경되었을 수 있으므로 다시 로드
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {webtoon.title} - 캐릭터 관리
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* 상단 액션 버튼 */}
            {profile && canCreateContent(profile.role) && (
              <div className="flex justify-end mb-4">
                <Button onClick={handleCreateCharacter} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  새 캐릭터
                </Button>
              </div>
            )}

            {/* 캐릭터 목록 */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : characters.length === 0 ? (
                <div className="text-center py-12">
                  <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground">등록된 캐릭터가 없습니다.</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    새 캐릭터를 추가해주세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
                  {characters.map((character) => (
                    <CharacterCard
                      key={character.id}
                      character={character}
                      onEdit={() => handleEditCharacter(character)}
                      onDelete={() => handleDeleteCharacter(character)}
                      onManageSheets={() => handleManageSheets(character)}
                      profile={profile}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* 캐릭터 추가/수정 다이얼로그 */}
      <CharacterEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        webtoonId={webtoon.id}
        character={editingCharacter}
        onSaved={handleCharacterSaved}
      />

      {/* 캐릭터 시트 관리 다이얼로그 */}
      {selectedCharacter && (
        <CharacterSheetDialog
          open={sheetDialogOpen}
          onOpenChange={handleSheetDialogClose}
          character={selectedCharacter}
        />
      )}
    </>
  );
}

// 캐릭터 카드 컴포넌트
interface CharacterCardProps {
  character: CharacterWithSheets;
  onEdit: () => void;
  onDelete: () => void;
  onManageSheets: () => void;
  profile: { role: string } | null;
}

function CharacterCard({ character, onEdit, onDelete, onManageSheets, profile }: CharacterCardProps) {
  const sheetCount = character.character_sheets?.length || 0;
  const firstSheet = character.character_sheets?.[0];

  return (
    <div
      className="group cursor-pointer rounded-xl overflow-hidden bg-card border border-border/50 hover:border-border transition-all duration-200 hover:shadow-lg"
      onClick={onManageSheets}
    >
      {/* 썸네일 영역 */}
      <div className="relative aspect-square bg-muted/50 overflow-hidden">
        {firstSheet ? (
          <img
            src={firstSheet.file_path}
            alt={character.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/80 to-muted">
            <User className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}

        {/* 케밥 메뉴 */}
        {profile && (canEditContent(profile.role as 'admin' | 'manager' | 'staff' | 'viewer') || canDeleteContent(profile.role as 'admin' | 'manager' | 'staff' | 'viewer')) && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm hover:bg-background"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onManageSheets(); }}>
                  <Image className="h-4 w-4 mr-2" />
                  캐릭터 시트 관리
                </DropdownMenuItem>
                {canEditContent(profile.role as 'admin' | 'manager' | 'staff' | 'viewer') && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                    <Edit className="h-4 w-4 mr-2" />
                    수정
                  </DropdownMenuItem>
                )}
                {canDeleteContent(profile.role as 'admin' | 'manager' | 'staff' | 'viewer') && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* 시트 개수 뱃지 */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-background/80 backdrop-blur-sm rounded text-xs font-medium">
          시트 {sheetCount}개
        </div>
      </div>

      {/* 정보 영역 */}
      <div className="p-3">
        <h3 className="font-semibold text-sm truncate">{character.name}</h3>
        {character.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {character.description}
          </p>
        )}
      </div>
    </div>
  );
}

