'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, ImageIcon, Loader2, X, Trash2, User } from 'lucide-react';
import { ReferenceFile } from '@/lib/supabase';
import { ReferenceFileUpload } from '@/components/ReferenceFileUpload';
import { CharacterSheetSelectDialog, SelectedCharacterSheet } from '@/components/CharacterSheetSelectDialog';
import { Process } from '@/lib/supabase';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface RecentReference {
  id: string;
  reference_file_id: string;
  used_at: string;
  reference_file?: {
    id: string;
    file_name: string;
    file_path: string;
    thumbnail_path?: string | null;
  };
}

interface FreeCreationSidebarProps {
  recentReferences: RecentReference[];
  selectedReferenceIds: Set<string>;
  onReferenceSelect: (referenceFile: ReferenceFile) => void;
  onReferenceDeselect: (referenceId: string) => void;
  onReferenceDelete?: (referenceId: string) => void;
  onCharacterSheetsSelected?: (sheets: SelectedCharacterSheet[]) => void;
  webtoonId: string;
  processes: Process[];
  onReferenceUpload?: (file: ReferenceFile) => void;
  loading?: boolean;
  readOnly?: boolean;
}

export function FreeCreationSidebar({
  recentReferences,
  selectedReferenceIds,
  onReferenceSelect,
  onReferenceDeselect,
  onReferenceDelete,
  onCharacterSheetsSelected,
  webtoonId,
  processes,
  onReferenceUpload,
  loading = false,
  readOnly = false,
}: FreeCreationSidebarProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [characterSheetDialogOpen, setCharacterSheetDialogOpen] = useState(false);
  const [selectedSheets, setSelectedSheets] = useState<SelectedCharacterSheet[]>([]);

  const handleReferenceClick = useCallback((ref: RecentReference) => {
    if (!ref.reference_file) return;

    const refFile = ref.reference_file as unknown as ReferenceFile;
    if (selectedReferenceIds.has(refFile.id)) {
      onReferenceDeselect(refFile.id);
    } else {
      onReferenceSelect(refFile);
    }
  }, [selectedReferenceIds, onReferenceSelect, onReferenceDeselect]);

  const handleUploadComplete = useCallback((uploadedFile?: ReferenceFile) => {
    if (uploadedFile && onReferenceUpload) {
      onReferenceUpload(uploadedFile);
      onReferenceSelect(uploadedFile);
    }
    setUploadDialogOpen(false);
  }, [onReferenceUpload, onReferenceSelect]);

  // 드래그 시작 핸들러
  const handleDragStart = useCallback((e: React.DragEvent, ref: RecentReference) => {
    if (!ref.reference_file) return;
    e.dataTransfer.setData('application/json', JSON.stringify(ref.reference_file));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <div className="w-[280px] flex-shrink-0 border-r flex flex-col bg-background h-full overflow-hidden">
      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">레퍼런스 이미지</h2>
          {!readOnly && onReferenceUpload && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setUploadDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {readOnly ? '레퍼런스 이미지 목록' : '클릭하여 선택하거나 우측으로 드래그'}
        </p>
      </div>

      {/* 레퍼런스 목록 */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentReferences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
              <p className="text-sm text-center">
                최근 사용한 레퍼런스가 없습니다.
              </p>
              {!readOnly && onReferenceUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setUploadDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  레퍼런스 추가
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {recentReferences.map((ref) => {
                if (!ref.reference_file) return null;
                const isSelected = selectedReferenceIds.has(ref.reference_file.id);
                const thumbnailUrl = ref.reference_file.thumbnail_path
                  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${ref.reference_file.thumbnail_path}`
                  : ref.reference_file.file_path;

                return (
                  <div
                    key={ref.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ref)}
                    onClick={() => handleReferenceClick(ref)}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all group',
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-2'
                        : 'hover:ring-2 hover:ring-primary/50 hover:ring-offset-1'
                    )}
                  >
                    <Image
                      src={thumbnailUrl}
                      alt={ref.reference_file.file_name}
                      fill
                      className="object-cover"
                      sizes="120px"
                      unoptimized
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary rounded-full p-1">
                          <svg className="h-4 w-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                    {/* 삭제 버튼 */}
                    {onReferenceDelete && (
                      <button
                        type="button"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('이 레퍼런스 이미지를 삭제하시겠습니까?')) {
                            onReferenceDelete(ref.reference_file.id);
                          }
                        }}
                        title="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-[10px] truncate">
                        {ref.reference_file.file_name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 하단 버튼 영역 */}
      <div className="flex-shrink-0 border-t bg-background">
        {/* 선택된 레퍼런스 개수 */}
        {selectedReferenceIds.size > 0 && (
          <div className="px-4 py-2 bg-muted/50">
            <p className="text-xs text-muted-foreground">
              {selectedReferenceIds.size}개 선택됨
            </p>
          </div>
        )}
        {/* 캐릭터시트에서 가져오기 버튼 */}
        {!readOnly && onCharacterSheetsSelected && (
          <div className="px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setCharacterSheetDialogOpen(true)}
            >
              <User className="h-4 w-4" />
              캐릭터시트에서 가져오기
            </Button>
          </div>
        )}
      </div>

      {/* 레퍼런스 업로드 다이얼로그 */}
      {!readOnly && onReferenceUpload && (
        <ReferenceFileUpload
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          webtoonId={webtoonId}
          processes={processes}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {/* 캐릭터시트 선택 다이얼로그 */}
      {!readOnly && onCharacterSheetsSelected && (
        <CharacterSheetSelectDialog
          open={characterSheetDialogOpen}
          onOpenChange={(open) => {
            setCharacterSheetDialogOpen(open);
            if (!open) {
              setSelectedSheets([]);
            }
          }}
          webtoonId={webtoonId}
          selectedSheets={selectedSheets}
          onSheetsChange={(sheets) => {
            setSelectedSheets(sheets);
            if (onCharacterSheetsSelected) {
              onCharacterSheetsSelected(sheets);
            }
          }}
        />
      )}
    </div>
  );
}
