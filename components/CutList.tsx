'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getCuts, createCut, updateCut, deleteCut } from '@/lib/api/cuts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Image, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { Cut } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent } from '@/lib/utils/permissions';

export function CutList() {
  const { selectedEpisode, selectedCut, setSelectedCut, profile } = useStore();
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCut, setEditingCut] = useState<Cut | null>(null);
  const [formData, setFormData] = useState({ cut_number: 1, title: '', description: '' });
  const [saving, setSaving] = useState(false);

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
      console.error('컷 목록 로드 실패:', error);
      alert('컷 목록을 불러오는데 실패했습니다.');
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
    if (!confirm(`컷 ${cut.cut_number}${cut.title ? ` - ${cut.title}` : ''}을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteCut(cut.id);
      if (selectedCut?.id === cut.id) {
        setSelectedCut(null);
      }
      await loadCuts();
      alert('컷이 삭제되었습니다.');
    } catch (error) {
      console.error('컷 삭제 실패:', error);
      alert('컷 삭제에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    if (!selectedEpisode) return;

    try {
      setSaving(true);
      if (editingCut) {
        await updateCut(editingCut.id, formData);
        alert('컷이 수정되었습니다.');
      } else {
        await createCut({
          episode_id: selectedEpisode.id,
          ...formData
        });
        alert('컷이 생성되었습니다.');
      }
      await loadCuts();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setEditingCut(null);
      setFormData({ cut_number: 1, title: '', description: '' });
    } catch (error) {
      console.error('컷 저장 실패:', error);
      alert(editingCut ? '컷 수정에 실패했습니다.' : '컷 생성에 실패했습니다.');
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
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-3">{selectedEpisode ? `${selectedEpisode.episode_number}화 - ${selectedEpisode.title}` : '컷 목록'}</h2>
        {profile && canCreateContent(profile.role) && (
          <Button size="sm" onClick={handleCreate} className="w-full mb-4">
            <Plus className="h-4 w-4 mr-2" />
            새 컷
          </Button>
        )}

        {cuts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>등록된 컷이 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cuts.map((cut) => (
              <Card key={cut.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedCut?.id === cut.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedCut(cut)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">
                        컷 {cut.cut_number}
                        {cut.title && ` - ${cut.title}`}
                      </CardTitle>
                    </div>
                    {profile && (canEditContent(profile.role) || canDeleteContent(profile.role)) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
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
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{cut.description}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 컷 생성 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>새 컷 추가</DialogTitle>
            <DialogDescription>새로운 컷을 추가합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">컷 번호 *</label>
              <Input
                type="number"
                value={formData.cut_number}
                onChange={(e) => setFormData({ ...formData, cut_number: parseInt(e.target.value) || 1 })}
                placeholder="컷 번호"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="컷 제목을 입력하세요 (선택사항)"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="컷 설명을 입력하세요 (선택사항)"
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

      {/* 컷 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>컷 수정</DialogTitle>
            <DialogDescription>컷 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">컷 번호 *</label>
              <Input
                type="number"
                value={formData.cut_number}
                onChange={(e) => setFormData({ ...formData, cut_number: parseInt(e.target.value) || 1 })}
                placeholder="컷 번호"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="컷 제목을 입력하세요 (선택사항)"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="컷 설명을 입력하세요 (선택사항)"
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


