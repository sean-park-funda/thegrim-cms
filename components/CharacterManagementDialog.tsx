'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Plus, User, Edit, Trash2, Image, MoreVertical, Sparkles, Loader2, Folder, FolderPlus, FolderOpen, GripVertical, X, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Webtoon, CharacterWithSheets, CharacterFolderWithCount } from '@/lib/supabase';
import { getCharactersByWebtoon, deleteCharacter } from '@/lib/api/characters';
import { getCharacterFoldersByWebtoon, createCharacterFolder, updateCharacterFolder, deleteCharacterFolder, moveCharacterToFolder } from '@/lib/api/characterFolders';
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
  const [folders, setFolders] = useState<CharacterFolderWithCount[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null); // null = 전체, 'uncategorized' = 미분류
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterWithSheets | null>(null);
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterWithSheets | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [draggedCharacterId, setDraggedCharacterId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadData = useCallback(async () => {
    if (!webtoon.id || !isMountedRef.current) return;
    
    try {
      setLoading(true);
      const [charactersData, foldersData] = await Promise.all([
        getCharactersByWebtoon(webtoon.id),
        getCharacterFoldersByWebtoon(webtoon.id),
      ]);
      
      if (!isMountedRef.current) return;
      
      setCharacters(charactersData);
      setFolders(foldersData);
    } catch (error) {
      if (!isMountedRef.current) return;
      
      console.error('데이터 로드 실패:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [webtoon.id]);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (open) {
      loadData();
    } else {
      // 다이얼로그가 닫힐 때 상태 초기화
      setCharacters([]);
      setFolders([]);
      setSelectedFolderId(null);
      setLoading(false);
      setIsCreatingFolder(false);
      setNewFolderName('');
      setEditingFolderId(null);
      setDraggedCharacterId(null);
      setDragOverFolderId(null);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [open, loadData]);

  // 필터링된 캐릭터 목록
  const filteredCharacters = characters.filter(character => {
    if (selectedFolderId === null) {
      // 전체 보기
      return true;
    } else if (selectedFolderId === 'uncategorized') {
      // 미분류만
      return !character.folder_id;
    } else {
      // 특정 폴더
      return character.folder_id === selectedFolderId;
    }
  });

  // 미분류 캐릭터 수
  const uncategorizedCount = characters.filter(c => !c.folder_id).length;

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
      if (isMountedRef.current) {
        await loadData();
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('캐릭터 삭제 실패:', error);
        alert('캐릭터 삭제에 실패했습니다.');
      }
    }
  };

  const handleManageSheets = (character: CharacterWithSheets) => {
    setSelectedCharacter(character);
    setSheetDialogOpen(true);
  };

  const handleCharacterSaved = () => {
    setEditDialogOpen(false);
    if (isMountedRef.current) {
      loadData();
    }
  };

  const handleSheetDialogClose = () => {
    setSheetDialogOpen(false);
    if (isMountedRef.current) {
      loadData();
    }
  };

  // 폴더 생성
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createCharacterFolder({
        webtoon_id: webtoon.id,
        name: newFolderName.trim(),
      });
      setNewFolderName('');
      setIsCreatingFolder(false);
      await loadData();
    } catch (error) {
      console.error('폴더 생성 실패:', error);
      alert('폴더 생성에 실패했습니다.');
    }
  };

  // 폴더 이름 수정
  const handleUpdateFolderName = async (folderId: string) => {
    if (!editingFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    
    try {
      await updateCharacterFolder(folderId, { name: editingFolderName.trim() });
      setEditingFolderId(null);
      setEditingFolderName('');
      await loadData();
    } catch (error) {
      console.error('폴더 이름 수정 실패:', error);
      alert('폴더 이름 수정에 실패했습니다.');
    }
  };

  // 폴더 삭제
  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`"${folderName}" 폴더를 삭제하시겠습니까?\n폴더 내 캐릭터들은 미분류로 이동됩니다.`)) {
      return;
    }
    
    try {
      await deleteCharacterFolder(folderId);
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      await loadData();
    } catch (error) {
      console.error('폴더 삭제 실패:', error);
      alert('폴더 삭제에 실패했습니다.');
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e: React.DragEvent, characterId: string) => {
    setDraggedCharacterId(characterId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', characterId);
  };

  const handleDragEnd = () => {
    setDraggedCharacterId(null);
    setDragOverFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    
    if (!draggedCharacterId) return;
    
    try {
      await moveCharacterToFolder(draggedCharacterId, targetFolderId);
      await loadData();
    } catch (error) {
      console.error('캐릭터 이동 실패:', error);
      alert('캐릭터 이동에 실패했습니다.');
    } finally {
      setDraggedCharacterId(null);
      setDragOverFolderId(null);
    }
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

          <div className="flex-1 overflow-hidden flex gap-4">
            {/* 왼쪽 사이드바: 폴더 목록 */}
            <div className="w-56 flex-shrink-0 flex flex-col border-r border-border pr-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">폴더</span>
                {profile && canCreateContent(profile.role) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setIsCreatingFolder(true)}
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-1">
                  {/* 전체 버튼 */}
                  <button
                    onClick={() => setSelectedFolderId(null)}
                    onDragOver={(e) => handleDragOver(e, null)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, null)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedFolderId === null
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <Folder className="h-4 w-4" />
                    <span className="flex-1 text-left">전체</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      selectedFolderId === null
                        ? 'bg-primary-foreground/20'
                        : 'bg-muted-foreground/20'
                    }`}>
                      {characters.length}
                    </span>
                  </button>

                  {/* 미분류 버튼 */}
                  <button
                    onClick={() => setSelectedFolderId('uncategorized')}
                    onDragOver={(e) => handleDragOver(e, 'uncategorized')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, null)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedFolderId === 'uncategorized'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    } ${dragOverFolderId === 'uncategorized' ? 'ring-2 ring-primary' : ''}`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span className="flex-1 text-left">미분류</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      selectedFolderId === 'uncategorized'
                        ? 'bg-primary-foreground/20'
                        : 'bg-muted-foreground/20'
                    }`}>
                      {uncategorizedCount}
                    </span>
                  </button>

                  {/* 폴더 목록 */}
                  {folders.map((folder) => (
                    <div key={folder.id} className="group relative">
                      {editingFolderId === folder.id ? (
                        <div className="flex items-center gap-1 px-2 py-1">
                          <Input
                            value={editingFolderName}
                            onChange={(e) => setEditingFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateFolderName(folder.id);
                              if (e.key === 'Escape') setEditingFolderId(null);
                            }}
                            className="h-7 text-sm"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleUpdateFolderName(folder.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditingFolderId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedFolderId(folder.id)}
                          onDragOver={(e) => handleDragOver(e, folder.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, folder.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            selectedFolderId === folder.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          } ${dragOverFolderId === folder.id ? 'ring-2 ring-primary' : ''}`}
                        >
                          <Folder className="h-4 w-4" />
                          <span className="flex-1 text-left truncate">{folder.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            selectedFolderId === folder.id
                              ? 'bg-primary-foreground/20'
                              : 'bg-muted-foreground/20'
                          }`}>
                            {folder.character_count}
                          </span>
                        </button>
                      )}
                      
                      {/* 폴더 메뉴 */}
                      {profile && (canEditContent(profile.role as 'admin' | 'manager' | 'staff' | 'viewer') || canDeleteContent(profile.role as 'admin' | 'manager' | 'staff' | 'viewer')) && editingFolderId !== folder.id && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}>
                                <Edit className="h-4 w-4 mr-2" />
                                이름 변경
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteFolder(folder.id, folder.name)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 새 폴더 입력 */}
                  {isCreatingFolder && (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <Input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="폴더 이름"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateFolder();
                          if (e.key === 'Escape') {
                            setIsCreatingFolder(false);
                            setNewFolderName('');
                          }
                        }}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim()}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setIsCreatingFolder(false);
                          setNewFolderName('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* 오른쪽: 캐릭터 목록 */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* 상단 액션 버튼 */}
              {profile && canCreateContent(profile.role) && (
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">
                    {selectedFolderId === null && '전체'}
                    {selectedFolderId === 'uncategorized' && '미분류'}
                    {selectedFolderId && selectedFolderId !== 'uncategorized' && folders.find(f => f.id === selectedFolderId)?.name}
                    {' '}({filteredCharacters.length}개)
                  </span>
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
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    로딩 중...
                  </div>
                ) : filteredCharacters.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground">
                      {selectedFolderId === 'uncategorized' 
                        ? '미분류 캐릭터가 없습니다.'
                        : selectedFolderId 
                          ? '이 폴더에 캐릭터가 없습니다.'
                          : '등록된 캐릭터가 없습니다.'}
                    </p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      새 캐릭터를 추가하거나 다른 폴더에서 드래그해 오세요.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
                    {filteredCharacters.map((character) => (
                      <CharacterCard
                        key={character.id}
                        character={character}
                        onEdit={() => handleEditCharacter(character)}
                        onDelete={() => handleDeleteCharacter(character)}
                        onManageSheets={() => handleManageSheets(character)}
                        onImageGenerated={loadData}
                        profile={profile}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        isDragging={draggedCharacterId === character.id}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
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
  onImageGenerated: () => void;
  profile: { role: string } | null;
  onDragStart: (e: React.DragEvent, characterId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function CharacterCard({ 
  character, 
  onEdit, 
  onDelete, 
  onManageSheets, 
  onImageGenerated, 
  profile,
  onDragStart,
  onDragEnd,
  isDragging,
}: CharacterCardProps) {
  const sheetCount = character.character_sheets?.length || 0;
  const firstSheet = character.character_sheets?.[0];
  const [generatingImage, setGeneratingImage] = useState(false);

  const handleGenerateImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (generatingImage) return;

    try {
      setGeneratingImage(true);
      const res = await fetch(`/api/characters/${character.id}/generate-image`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      onImageGenerated();
    } catch (error) {
      console.error('캐릭터 이미지 생성 실패:', error);
      alert(error instanceof Error ? error.message : '이미지 생성에 실패했습니다.');
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, character.id)}
      onDragEnd={onDragEnd}
      className={`group cursor-pointer rounded-xl overflow-hidden bg-card border border-border/50 hover:border-border transition-all duration-200 hover:shadow-lg ${
        isDragging ? 'opacity-50 scale-95' : ''
      }`}
      onClick={onManageSheets}
    >
      {/* 드래그 핸들 */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <div className="p-1 bg-background/80 backdrop-blur-sm rounded cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

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
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleGenerateImage(e); }} disabled={generatingImage}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {generatingImage ? '이미지 생성 중...' : '이미지 생성'}
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
