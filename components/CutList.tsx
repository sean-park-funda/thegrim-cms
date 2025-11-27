'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getCuts, createCut, updateCut, deleteCut } from '@/lib/api/cuts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Image, MoreVertical, Edit, Trash2, File } from 'lucide-react';
import { Cut } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent } from '@/lib/utils/permissions';

import { ScrollArea } from '@/components/ui/scroll-area';

export function CutList() {
  const { selectedWebtoon, selectedEpisode, selectedCut, setSelectedCut, profile } = useStore();
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCut, setEditingCut] = useState<Cut | null>(null);
  const [formData, setFormData] = useState({ cut_number: 1, title: '', description: '' });
  const [saving, setSaving] = useState(false);

  const unitType = selectedWebtoon?.unit_type || 'cut';
  const unitLabel = unitType === 'cut' ? '컷' : '페이지';

  useEffect(() => {
    if (selectedEpisode) {
      loadCuts();
    } else {
      setCuts([]);
    }
  }, [selectedEpisode]);

  const loadCuts = async () => {
    if (!selectedEpisode) return;

    try {
      setLoading(true);
      const data = await getCuts(selectedEpisode.id);
      setCuts(data);
    } catch (error) {
      console.error(`${unitLabel} 목록 로드 실패:`, error);
      alert(`${unitLabel} 목록을 불러오는데 실패했습니다.`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    if (!selectedEpisode) return;
    const nextCutNumber = cuts.length > 0 ? Math.max(...cuts.map(c => c.cut_number)) + 1 : 1;
    setFormData({ cut_number: nextCutNumber, title: '', description: '' });
    setEditingCut(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (cut: Cut, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCut(cut);
    setFormData({
      cut_number: cut.cut_number,
      title: cut.title || '',
      description: cut.description || ''
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (cut: Cut, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`${unitLabel} ${cut.cut_number}${cut.title ? ` - ${cut.title}` : ''}을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteCut(cut.id);
      if (selectedCut?.id === cut.id) {
        setSelectedCut(null);
      }
      await loadCuts();
      alert(`${unitLabel}이(가) 삭제되었습니다.`);
    } catch (error) {
      console.error(`${unitLabel} 삭제 실패:`, error);
      alert(`${unitLabel} 삭제에 실패했습니다.`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleSave = async () => {
    if (!selectedEpisode) return;

    try {
      setSaving(true);
      let newCut: Cut | null = null;

      if (editingCut) {
        await updateCut(editingCut.id, formData);
        alert(`${unitLabel}이(가) 수정되었습니다.`);
      } else {
        newCut = await createCut({
          episode_id: selectedEpisode.id,
          ...formData
        });
        // 생성 시 얼러트 제거
      }

      await loadCuts();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setEditingCut(null);
      setFormData({ cut_number: 1, title: '', description: '' });

      // 새로 생성된 컷이 있으면 선택
      if (newCut) {
        setSelectedCut(newCut);
      }
    } catch (error) {
      console.error(`${unitLabel} 저장 실패:`, error);
      alert(editingCut ? `${unitLabel} 수정에 실패했습니다.` : `${unitLabel} 생성에 실패했습니다.`);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedEpisode) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>회차를 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* 상단 고정: 생성 버튼 */}
        {profile && canCreateContent(profile.role) && (
          <div className="p-3 sm:p-4 pb-2 flex-shrink-0 border-b bg-background z-10">
            <Button size="sm" onClick={handleCreate} className="w-full h-9 sm:h-8 touch-manipulation">
              <Plus className="h-4 w-4 mr-2" />
              새 {unitLabel}
            </Button>
          </div>
        )}

        {/* 중간 스크롤: 컷/페이지 목록 */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-2 py-2">
            {cuts.length === 0 ? (
              <Card>
                <CardContent className="py-6 sm:py-8 text-center text-muted-foreground">
                  <Image className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm sm:text-base">등록된 {unitLabel}이 없습니다.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-1 sm:gap-1.5">
                {cuts.map((cut) => (
                  <Card key={cut.id} className={`cursor-pointer transition-all duration-200 ease-in-out active:scale-[0.98] touch-manipulation hover:bg-accent/50 ${selectedCut?.id === cut.id ? 'ring-2 ring-primary bg-accent' : ''}`} onClick={() => setSelectedCut(cut)}>
                    <CardHeader className="pb-1 pt-2 px-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-xs sm:text-sm flex items-center gap-1">
                            <span>
                              {unitLabel} {cut.cut_number}
                              {cut.title && ` - ${cut.title}`}
                            </span>
                            {cut.files_count !== undefined && (
                              <Badge variant="outline" className="text-[10px] whitespace-nowrap flex items-center gap-0.5">
                                <File className="h-2.5 w-2.5" />
                                {cut.files_count}
                              </Badge>
                            )}
                          </CardTitle>
                        </div>
                        {profile && (canEditContent(profile.role) || canDeleteContent(profile.role)) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 sm:h-6 sm:w-6 p-0 touch-manipulation">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEditContent(profile.role) && (
                                <DropdownMenuItem onClick={(e) => handleEdit(cut, e)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  수정
                                </DropdownMenuItem>
                              )}
                              {canDeleteContent(profile.role) && (
                                <DropdownMenuItem onClick={(e) => handleDelete(cut, e)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  삭제
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </CardHeader>
                    {cut.description && (
                      <CardContent className="pt-0 pb-1.5 px-3">
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2">{cut.description}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 생성 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>새 {unitLabel} 추가</DialogTitle>
            <DialogDescription>새로운 {unitLabel}을(를) 추가합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{unitLabel} 번호 *</label>
              <Input
                type="number"
                value={formData.cut_number}
                onChange={(e) => setFormData({ ...formData, cut_number: parseInt(e.target.value) || 1 })}
                placeholder={`${unitLabel} 번호`}
                min="1"
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={`${unitLabel} 제목을 입력하세요 (선택사항)`}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={`${unitLabel} 설명을 입력하세요 (선택사항)`}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{unitLabel} 수정</DialogTitle>
            <DialogDescription>{unitLabel} 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{unitLabel} 번호 *</label>
              <Input
                type="number"
                value={formData.cut_number}
                onChange={(e) => setFormData({ ...formData, cut_number: parseInt(e.target.value) || 1 })}
                placeholder={`${unitLabel} 번호`}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={`${unitLabel} 제목을 입력하세요 (선택사항)`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={`${unitLabel} 설명을 입력하세요 (선택사항)`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '수정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


