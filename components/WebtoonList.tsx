'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getWebtoons, createWebtoon, updateWebtoon, deleteWebtoon } from '@/lib/api/webtoons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Film, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { Webtoon } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent } from '@/lib/utils/permissions';

export function WebtoonList() {
  const { webtoons, setWebtoons, selectedWebtoon, setSelectedWebtoon, profile } = useStore();
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWebtoon, setEditingWebtoon] = useState<Webtoon | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', status: 'active' as 'active' | 'completed' });
  const [saving, setSaving] = useState(false);

  // Dialog 상태 디버깅
  useEffect(() => {
    console.log('createDialogOpen changed:', createDialogOpen);
  }, [createDialogOpen]);

  useEffect(() => {
    loadWebtoons();
  }, []);

  const loadWebtoons = async () => {
    try {
      setLoading(true);
      const data = await getWebtoons();
      setWebtoons(data);
    } catch (error) {
      console.error('웹툰 목록 로드 실패:', error);
      alert('웹툰 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    console.log('handleCreate called');
    setFormData({ title: '', description: '', status: 'active' });
    setEditingWebtoon(null);
    setCreateDialogOpen(true);
    console.log('createDialogOpen should be true');
  };

  const handleEdit = (webtoon: Webtoon, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWebtoon(webtoon);
    setFormData({
      title: webtoon.title,
      description: webtoon.description || '',
      status: webtoon.status as 'active' | 'completed'
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (webtoon: Webtoon, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${webtoon.title}" 웹툰을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteWebtoon(webtoon.id);
      if (selectedWebtoon?.id === webtoon.id) {
        setSelectedWebtoon(null);
      }
      await loadWebtoons();
      alert('웹툰이 삭제되었습니다.');
    } catch (error) {
      console.error('웹툰 삭제 실패:', error);
      alert('웹툰 삭제에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('웹툰 제목을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      if (editingWebtoon) {
        await updateWebtoon(editingWebtoon.id, formData);
        alert('웹툰이 수정되었습니다.');
      } else {
        await createWebtoon(formData);
        alert('웹툰이 생성되었습니다.');
      }
      await loadWebtoons();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setEditingWebtoon(null);
      setFormData({ title: '', description: '', status: 'active' });
    } catch (error) {
      console.error('웹툰 저장 실패:', error);
      alert(editingWebtoon ? '웹툰 수정에 실패했습니다.' : '웹툰 생성에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <>
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-3">웹툰 목록</h2>
        {profile && canCreateContent(profile.role) && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Button clicked - raw button');
              handleCreate();
            }}
            className="w-full mb-4 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-8 rounded-md gap-1.5 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            새 웹툰
          </button>
        )}

        {webtoons.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>등록된 웹툰이 없습니다.</p>
              <p className="text-sm mt-1">새 웹툰을 추가해주세요.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {webtoons.map((webtoon) => (
              <Card key={webtoon.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedWebtoon?.id === webtoon.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedWebtoon(webtoon)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{webtoon.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={webtoon.status === 'active' ? 'default' : 'secondary'}>
                        {webtoon.status === 'active' ? '진행중' : '완료'}
                      </Badge>
                      {profile && (canEditContent(profile.role) || canDeleteContent(profile.role)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEditContent(profile.role) && (
                              <DropdownMenuItem onClick={(e) => handleEdit(webtoon, e)}>
                                <Edit className="h-4 w-4 mr-2" />
                                수정
                              </DropdownMenuItem>
                            )}
                            {canDeleteContent(profile.role) && (
                              <DropdownMenuItem onClick={(e) => handleDelete(webtoon, e)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {webtoon.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{webtoon.description}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 웹툰 생성 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>새 웹툰 추가</DialogTitle>
            <DialogDescription>새로운 웹툰을 추가합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">제목 *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="웹툰 제목을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="웹툰 설명을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={formData.status} onValueChange={(value: 'active' | 'completed') => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">진행중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                </SelectContent>
              </Select>
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

      {/* 웹툰 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>웹툰 수정</DialogTitle>
            <DialogDescription>웹툰 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">제목 *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="웹툰 제목을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="웹툰 설명을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={formData.status} onValueChange={(value: 'active' | 'completed') => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">진행중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                </SelectContent>
              </Select>
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


