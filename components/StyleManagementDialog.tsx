'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Pencil, GripVertical, ArrowLeft, Trash2 } from 'lucide-react';
import { AiRegenerationStyle } from '@/lib/supabase';
import { getAllStyles, updateStyle, deleteStyle } from '@/lib/api/aiStyles';
import { StyleEditDialog } from './StyleEditDialog';

interface StyleManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStylesChange?: () => void;
}

export function StyleManagementDialog({
  open,
  onOpenChange,
  onStylesChange,
}: StyleManagementDialogProps) {
  const [styles, setStyles] = useState<AiRegenerationStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingStyle, setEditingStyle] = useState<AiRegenerationStyle | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [draggedStyle, setDraggedStyle] = useState<AiRegenerationStyle | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverDelete, setDragOverDelete] = useState(false);

  // 스타일 목록 로드
  const loadStyles = async () => {
    setLoading(true);
    try {
      const data = await getAllStyles();
      setStyles(data);
    } catch (error) {
      console.error('스타일 목록 로드 실패:', error);
      alert('스타일 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadStyles();
    }
  }, [open]);

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent, style: AiRegenerationStyle) => {
    setDraggedStyle(style);
    e.dataTransfer.effectAllowed = 'move';
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggedStyle(null);
    setDragOverGroup(null);
    setDragOverDelete(false);
  };

  // 그룹 위로 드래그
  const handleDragOver = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupName);
    setDragOverDelete(false);
  };

  // 삭제 영역 위로 드래그
  const handleDeleteDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDelete(true);
    setDragOverGroup(null);
  };

  // 삭제 영역에서 드래그 떠남
  const handleDeleteDragLeave = () => {
    setDragOverDelete(false);
  };

  // 삭제 영역에 드롭
  const handleDeleteDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedStyle) return;

    const confirmed = window.confirm(`"${draggedStyle.name}" 스타일을 삭제하시겠습니까?`);
    if (!confirmed) {
      setDraggedStyle(null);
      setDragOverDelete(false);
      return;
    }

    setActionLoading(draggedStyle.id);
    try {
      await deleteStyle(draggedStyle.id);
      await loadStyles();
      onStylesChange?.();
    } catch (error) {
      console.error('스타일 삭제 실패:', error);
      alert('스타일 삭제에 실패했습니다.');
    } finally {
      setActionLoading(null);
      setDraggedStyle(null);
      setDragOverDelete(false);
    }
  };

  // 그룹에 드롭
  const handleDrop = async (e: React.DragEvent, targetGroupName: string) => {
    e.preventDefault();
    if (!draggedStyle) return;
    
    const newGroupName = targetGroupName === '기타' ? null : targetGroupName;
    if (draggedStyle.group_name === newGroupName) {
      setDraggedStyle(null);
      setDragOverGroup(null);
      return;
    }

    setActionLoading(draggedStyle.id);
    try {
      await updateStyle(draggedStyle.id, { group_name: newGroupName });
      await loadStyles();
      onStylesChange?.();
    } catch (error) {
      console.error('스타일 그룹 변경 실패:', error);
      alert('스타일 그룹 변경에 실패했습니다.');
    } finally {
      setActionLoading(null);
      setDraggedStyle(null);
      setDragOverGroup(null);
    }
  };

  // 스타일 수정 완료 핸들러
  const handleEditComplete = () => {
    setEditingStyle(null);
    loadStyles();
    onStylesChange?.();
  };

  // 스타일 생성 완료 핸들러
  const handleCreateComplete = () => {
    setCreateDialogOpen(false);
    loadStyles();
    onStylesChange?.();
  };

  // 그룹별로 스타일 분류 (활성 스타일만)
  const groupedStyles = styles.reduce((acc, style) => {
    if (!style.is_active) return acc;
    const groupKey = style.group_name || '기타';
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(style);
    return acc;
  }, {} as Record<string, AiRegenerationStyle[]>);

  // 그룹 정렬 (기타는 마지막에)
  const sortedGroups = Object.keys(groupedStyles).sort((a, b) => {
    if (a === '기타') return 1;
    if (b === '기타') return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>스타일 관리</DialogTitle>
          </DialogHeader>

          <div className="flex items-center py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              새 스타일 추가
            </Button>
          </div>

          {/* 삭제 영역 */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 mb-4 transition-colors ${
              dragOverDelete
                ? 'border-destructive bg-destructive/10'
                : 'border-muted-foreground/30 bg-muted/20'
            }`}
            onDragOver={handleDeleteDragOver}
            onDragLeave={handleDeleteDragLeave}
            onDrop={handleDeleteDrop}
          >
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Trash2 className={`h-4 w-4 ${dragOverDelete ? 'text-destructive' : ''}`} />
              <span className={`text-sm font-medium ${dragOverDelete ? 'text-destructive' : ''}`}>
                {dragOverDelete ? '여기에 놓으면 삭제됩니다' : '스타일을 여기로 드래그하여 삭제'}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto max-h-[50vh]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sortedGroups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                등록된 스타일이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-4">
                {sortedGroups.map((groupName) => (
                  <div
                    key={groupName}
                    className={`border rounded-lg p-3 bg-card transition-colors ${
                      dragOverGroup === groupName ? 'border-primary bg-primary/5' : ''
                    }`}
                    onDragOver={(e) => handleDragOver(e, groupName)}
                    onDragLeave={() => setDragOverGroup(null)}
                    onDrop={(e) => handleDrop(e, groupName)}
                  >
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      {groupName}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {groupedStyles[groupName].map((style) => (
                        <div
                          key={style.id}
                          draggable={actionLoading !== style.id}
                          onDragStart={(e) => handleDragStart(e, style)}
                          onDragEnd={handleDragEnd}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm bg-accent/30 hover:bg-accent/50 ${
                            draggedStyle?.id === style.id ? 'opacity-50' : ''
                          } transition-colors`}
                        >
                          <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                          <span>{style.name}</span>
                          {actionLoading === style.id ? (
                            <Loader2 className="h-3 w-3 animate-spin ml-1" />
                          ) : (
                            <button
                              onClick={() => setEditingStyle(style)}
                              className="ml-1 p-0.5 rounded hover:bg-accent/50"
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              뒤로
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 스타일 수정 다이얼로그 */}
      <StyleEditDialog
        open={!!editingStyle}
        onOpenChange={(open) => !open && setEditingStyle(null)}
        style={editingStyle}
        onComplete={handleEditComplete}
      />

      {/* 스타일 생성 다이얼로그 */}
      <StyleEditDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        style={null}
        onComplete={handleCreateComplete}
      />
    </>
  );
}

