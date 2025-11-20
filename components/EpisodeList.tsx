'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getEpisodes, createEpisode, updateEpisode, deleteEpisode } from '@/lib/api/episodes';
import { updateWebtoon } from '@/lib/api/webtoons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, BookOpen, MoreVertical, Edit, Trash2, Folder, File } from 'lucide-react';
import { Episode } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent } from '@/lib/utils/permissions';

export function EpisodeList() {
  const { selectedWebtoon, selectedEpisode, setSelectedEpisode, profile, setSelectedWebtoon } = useStore();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [formData, setFormData] = useState({ episode_number: 1, title: '', description: '', status: 'pending' as 'pending' | 'in_progress' | 'completed' });
  const [saving, setSaving] = useState(false);
  const [updatingUnitType, setUpdatingUnitType] = useState(false);

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
      // "기타" 회차(episode_number = 0)를 맨 위에 고정하고, 나머지는 episode_number 순으로 정렬
      const sortedData = [...data].sort((a, b) => {
        if (a.episode_number === 0) return -1;
        if (b.episode_number === 0) return 1;
        return a.episode_number - b.episode_number;
      });
      setEpisodes(sortedData);
    } catch (error) {
      console.error('회차 목록 로드 실패:', error);
      alert('회차 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    if (!selectedWebtoon) return;
    // episode_number = 0인 "기타" 회차는 제외하고 다음 번호 계산
    const regularEpisodes = episodes.filter(e => e.episode_number !== 0);
    const nextEpisodeNumber = regularEpisodes.length > 0 ? Math.max(...regularEpisodes.map(e => e.episode_number)) + 1 : 1;
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
    // "기타" 회차는 삭제 불가
    if (episode.episode_number === 0) {
      alert('"기타" 회차는 삭제할 수 없습니다.');
      return;
    }
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
    // episode_number = 0은 사용 불가 (기타 회차는 자동 생성)
    if (formData.episode_number === 0) {
      alert('회차 번호 0은 사용할 수 없습니다. "기타" 회차는 자동으로 생성됩니다.');
      return;
    }

    try {
      setSaving(true);
      if (editingEpisode) {
        // "기타" 회차는 episode_number 변경 불가
        const updateData = editingEpisode.episode_number === 0
          ? { ...formData, episode_number: 0 }
          : formData;
        await updateEpisode(editingEpisode.id, updateData);
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

  const handleUnitTypeChange = async (newUnitType: 'cut' | 'page') => {
    if (!selectedWebtoon || !profile || !canEditContent(profile.role)) return;
    if (selectedWebtoon.unit_type === newUnitType) return;

    const newUnitLabel = newUnitType === 'cut' ? '컷' : '페이지';
    const currentUnitLabel = unitTypeLabel;
    
    if (!confirm(`관리 단위를 "${currentUnitLabel}"에서 "${newUnitLabel}"로 변경하시겠습니까?`)) {
      return;
    }

    try {
      setUpdatingUnitType(true);
      const updatedWebtoon = await updateWebtoon(selectedWebtoon.id, { unit_type: newUnitType });
      setSelectedWebtoon(updatedWebtoon);
    } catch (error: any) {
      console.error('관리 단위 변경 실패:', error);
      const errorMessage = error?.message || error?.error?.message || '알 수 없는 오류';
      if (errorMessage.includes('column') || errorMessage.includes('unit_type')) {
        alert('데이터베이스에 unit_type 컬럼이 없습니다. 먼저 데이터베이스 마이그레이션을 실행해주세요.');
      } else {
        alert(`관리 단위 변경에 실패했습니다: ${errorMessage}`);
      }
    } finally {
      setUpdatingUnitType(false);
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

  const unitType = selectedWebtoon.unit_type || 'cut';
  const unitTypeLabel = unitType === 'cut' ? '컷' : '페이지';

  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <h2 className="text-base sm:text-lg font-semibold truncate flex-1">{selectedWebtoon.title}</h2>
          {profile && canEditContent(profile.role) && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">관리단위:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    disabled={updatingUnitType}
                  >
                    {unitTypeLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleUnitTypeChange('cut')}
                    className={unitType === 'cut' ? 'bg-accent' : ''}
                  >
                    컷
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleUnitTypeChange('page')}
                    className={unitType === 'page' ? 'bg-accent' : ''}
                  >
                    페이지
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {profile && canCreateContent(profile.role) && (
          <Button size="sm" onClick={handleCreate} className="w-full mb-3 sm:mb-4 h-9 sm:h-8 touch-manipulation">
            <Plus className="h-4 w-4 mr-2" />
            새 회차
          </Button>
        )}

        {episodes.length === 0 ? (
          <Card>
            <CardContent className="py-6 sm:py-8 text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm sm:text-base">등록된 회차가 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {episodes.map((episode) => {
              const isMiscEpisode = episode.episode_number === 0;
              return (
                <Card key={episode.id} className={`cursor-pointer transition-all duration-200 ease-in-out active:scale-[0.98] touch-manipulation flex flex-col hover:bg-accent/50 ${selectedEpisode?.id === episode.id ? 'ring-2 ring-primary bg-accent' : ''} ${isMiscEpisode ? 'bg-muted/50 border-dashed' : ''}`} onClick={() => setSelectedEpisode(episode)}>
                  <CardHeader className="pb-2 flex-shrink-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm sm:text-base line-clamp-2 flex items-center gap-1.5">
                          {isMiscEpisode && <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                          <span>{isMiscEpisode ? '기타' : `${episode.episode_number}화`} - {episode.title}</span>
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        {episode.files_count !== undefined && (
                          <Badge variant="outline" className="text-xs whitespace-nowrap flex items-center gap-1">
                            <File className="h-3 w-3" />
                            {episode.files_count}
                          </Badge>
                        )}
                        {profile && (canEditContent(profile.role) || canDeleteContent(profile.role)) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-9 w-9 sm:h-8 sm:w-8 p-0 touch-manipulation">
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
                              {canDeleteContent(profile.role) && !isMiscEpisode && (
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
                    <CardContent className="pt-0 pb-4 flex-1 flex flex-col justify-end">
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3">{episode.description}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
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
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  if (value === 0) {
                    alert('회차 번호 0은 사용할 수 없습니다. "기타" 회차는 자동으로 생성됩니다.');
                    return;
                  }
                  setFormData({ ...formData, episode_number: value });
                }}
                placeholder="회차 번호"
                min="1"
              />
              <p className="text-xs text-muted-foreground">회차 번호 0은 "기타" 회차로 예약되어 있습니다.</p>
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
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  if (value === 0) {
                    alert('회차 번호 0은 사용할 수 없습니다. "기타" 회차는 자동으로 생성됩니다.');
                    return;
                  }
                  setFormData({ ...formData, episode_number: value });
                }}
                placeholder="회차 번호"
                min="1"
                disabled={editingEpisode?.episode_number === 0}
              />
              {editingEpisode?.episode_number === 0 ? (
                <p className="text-xs text-muted-foreground">"기타" 회차의 회차 번호는 변경할 수 없습니다.</p>
              ) : (
                <p className="text-xs text-muted-foreground">회차 번호 0은 "기타" 회차로 예약되어 있습니다.</p>
              )}
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


