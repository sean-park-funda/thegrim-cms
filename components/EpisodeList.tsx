'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getEpisodes, createEpisode, updateEpisode, deleteEpisode } from '@/lib/api/episodes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, BookOpen, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { Episode } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent } from '@/lib/utils/permissions';

export function EpisodeList() {
  const { selectedWebtoon, selectedEpisode, setSelectedEpisode, profile } = useStore();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [formData, setFormData] = useState({ episode_number: 1, title: '', description: '', status: 'pending' as 'pending' | 'in_progress' | 'completed' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedWebtoon) {
      loadEpisodes();
    } else {
      setEpisodes([]);
    }
  }, [selectedWebtoon]);

  const loadEpisodes = async () => {
    if (!selectedWebtoon) return;

    try {
      setLoading(true);
      const data = await getEpisodes(selectedWebtoon.id);
      setEpisodes(data);
    } catch (error) {
      console.error('회차 목록 로드 실패:', error);
      alert('회차 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    if (!selectedWebtoon) return;
    const nextEpisodeNumber = episodes.length > 0 ? Math.max(...episodes.map(e => e.episode_number)) + 1 : 1;
    setFormData({ episode_number: nextEpisodeNumber, title: '', description: '', status: 'pending' });
    setEditingEpisode(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (episode: Episode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEpisode(episode);
    setFormData({
      episode_number: episode.episode_number,
      title: episode.title,
      description: episode.description || '',
      status: episode.status as 'pending' | 'in_progress' | 'completed'
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (episode: Episode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${episode.episode_number}화 - ${episode.title}" 회차를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteEpisode(episode.id);
      if (selectedEpisode?.id === episode.id) {
        setSelectedEpisode(null);
      }
      await loadEpisodes();
      alert('회차가 삭제되었습니다.');
    } catch (error) {
      console.error('회차 삭제 실패:', error);
      alert('회차 삭제에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    if (!selectedWebtoon) return;
    if (!formData.title.trim()) {
      alert('회차 제목을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      if (editingEpisode) {
        await updateEpisode(editingEpisode.id, formData);
        alert('회차가 수정되었습니다.');
      } else {
        await createEpisode({
          webtoon_id: selectedWebtoon.id,
          ...formData
        });
        alert('회차가 생성되었습니다.');
      }
      await loadEpisodes();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setEditingEpisode(null);
      setFormData({ episode_number: 1, title: '', description: '', status: 'pending' });
    } catch (error) {
      console.error('회차 저장 실패:', error);
      alert(editingEpisode ? '회차 수정에 실패했습니다.' : '회차 생성에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedWebtoon) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>웹툰을 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <>
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-3">{selectedWebtoon.title}</h2>
        {profile && canCreateContent(profile.role) && (
          <Button size="sm" onClick={handleCreate} className="w-full mb-4">
            <Plus className="h-4 w-4 mr-2" />
            새 회차
          </Button>
        )}

        {episodes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>등록된 회차가 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {episodes.map((episode) => (
              <Card key={episode.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedEpisode?.id === episode.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedEpisode(episode)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">
                        {episode.episode_number}화 - {episode.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={episode.status === 'completed' ? 'default' : episode.status === 'in_progress' ? 'secondary' : 'outline'}>
                        {episode.status === 'completed' ? '완료' : episode.status === 'in_progress' ? '진행중' : '대기'}
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
                              <DropdownMenuItem onClick={(e) => handleEdit(episode, e)}>
                                <Edit className="h-4 w-4 mr-2" />
                                수정
                              </DropdownMenuItem>
                            )}
                            {canDeleteContent(profile.role) && (
                              <DropdownMenuItem onClick={(e) => handleDelete(episode, e)} className="text-destructive">
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
                {episode.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{episode.description}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 회차 생성 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>새 회차 추가</DialogTitle>
            <DialogDescription>새로운 회차를 추가합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">회차 번호 *</label>
              <Input
                type="number"
                value={formData.episode_number}
                onChange={(e) => setFormData({ ...formData, episode_number: parseInt(e.target.value) || 1 })}
                placeholder="회차 번호"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목 *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="회차 제목을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="회차 설명을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={formData.status} onValueChange={(value: 'pending' | 'in_progress' | 'completed') => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기</SelectItem>
                  <SelectItem value="in_progress">진행중</SelectItem>
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

      {/* 회차 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회차 수정</DialogTitle>
            <DialogDescription>회차 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">회차 번호 *</label>
              <Input
                type="number"
                value={formData.episode_number}
                onChange={(e) => setFormData({ ...formData, episode_number: parseInt(e.target.value) || 1 })}
                placeholder="회차 번호"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목 *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="회차 제목을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="회차 설명을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={formData.status} onValueChange={(value: 'pending' | 'in_progress' | 'completed') => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기</SelectItem>
                  <SelectItem value="in_progress">진행중</SelectItem>
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


