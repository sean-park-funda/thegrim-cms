'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { getEpisodes, createEpisode, updateEpisode, deleteEpisode } from '@/lib/api/episodes';
import { updateWebtoon } from '@/lib/api/webtoons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, BookOpen, MoreVertical, Edit, Trash2, Folder, FileText, Users, Sparkles, Box } from 'lucide-react';
import Link from 'next/link';
import { Episode, WebtoonWithEpisodes } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent, UserRole } from '@/lib/utils/permissions';
import { CharacterManagementDialog } from './CharacterManagementDialog';

interface EpisodeListProps {
  webtoon: WebtoonWithEpisodes;
}

// 날짜 포맷 함수
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.', '');
}

// 상태 스타일
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: '대기' },
  in_progress: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '진행중' },
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '완료' },
};

// 회차 카드 컴포넌트
interface EpisodeCardProps {
  episode: Episode;
  isSelected: boolean;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  profile: { role: UserRole } | null;
}

function EpisodeCard({ episode, isSelected, onClick, onEdit, onDelete, profile }: EpisodeCardProps) {
  const isMiscEpisode = episode.episode_number === 0;
  const statusStyle = STATUS_STYLES[episode.status || 'pending'] || STATUS_STYLES.pending;

  return (
    <div
      className={`
        group cursor-pointer rounded-xl overflow-hidden
        bg-card border transition-all duration-200 ease-out
        hover:scale-[1.02] hover:shadow-xl
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border/50 hover:border-border'}
        ${isMiscEpisode ? 'border-dashed bg-muted/30' : ''}
      `}
      style={{ aspectRatio: '4/5' }}
      onClick={onClick}
    >
      {/* 상단 영역 (70%) - 썸네일 또는 회차 정보 표시 */}
      <div className="relative h-[70%] bg-muted/50 overflow-hidden">
        {episode.thumbnail_url ? (
          <img
            src={episode.thumbnail_url}
            alt={`${episode.episode_number}화 썸네일`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center p-4">
              {isMiscEpisode ? (
                <Folder className="h-12 w-12 text-muted-foreground/40 mx-auto mb-2" />
              ) : (
                <div className="text-4xl font-bold text-muted-foreground/30 mb-2">
                  {episode.episode_number}
                </div>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
            </div>
          </div>
        )}

        {/* 케밥 메뉴 (우상단) */}
        {profile && (canEditContent(profile.role) || canDeleteContent(profile.role)) && (
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
                {canEditContent(profile.role) && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    수정
                  </DropdownMenuItem>
                )}
                {canDeleteContent(profile.role) && !isMiscEpisode && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* 파일 개수 (좌상단) */}
        {episode.files_count !== undefined && episode.files_count > 0 && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-background/80 text-foreground">
              <FileText className="h-3 w-3" />
              {episode.files_count}
            </span>
          </div>
        )}
      </div>

      {/* 정보 영역 (30%) */}
      <div className="h-[30%] p-3 flex flex-col justify-between">
        {/* 제목 */}
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight">
          {isMiscEpisode ? '기타' : `${episode.episode_number}화`} - {episode.title}
        </h3>

        {/* 하단 정보 */}
        <div className="space-y-1">
          {episode.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {episode.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground/70">
            업데이트 {formatDate(episode.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EpisodeList({ webtoon }: EpisodeListProps) {
  const router = useRouter();
  const { profile, setWebtoons, setSelectedWebtoon } = useStore();
  // 서버에서 가져온 데이터를 즉시 표시 (SSR 데이터 활용)
  const [episodes, setEpisodes] = useState<Episode[]>(webtoon.episodes || []);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false); // 추가 정보 갱신 중 표시
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [formData, setFormData] = useState({ episode_number: 1, title: '', description: '', status: 'pending' as 'pending' | 'in_progress' | 'completed' });
  const [saving, setSaving] = useState(false);
  const [updatingUnitType, setUpdatingUnitType] = useState(false);
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [currentWebtoon, setCurrentWebtoon] = useState(webtoon);

  const loadEpisodes = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const data = await getEpisodes(webtoon.id);
      setEpisodes(data);
    } catch (error) {
      console.error('회차 목록 로드 실패:', error);
      // 서버 데이터가 있으면 에러 시에도 기존 데이터 유지
      if (episodes.length === 0) {
        alert('회차 목록을 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // webtoon prop이 변경되면 즉시 반영 (Next.js 네비게이션 시 새 데이터)
  useEffect(() => {
    if (webtoon.episodes && webtoon.episodes.length > 0) {
      setEpisodes(webtoon.episodes);
    }
    setCurrentWebtoon(webtoon);
  }, [webtoon]);

  // 컴포넌트 마운트 시 추가 정보 로드 (thumbnail_url, files_count 등)
  // 서버 데이터가 있어도 클라이언트에서 최신 데이터로 갱신
  useEffect(() => {
    // 서버에서 가져온 데이터가 있으면 로딩 없이 백그라운드 갱신
    const hasServerData = webtoon.episodes && webtoon.episodes.length > 0;
    loadEpisodes(!hasServerData);
  }, [webtoon.id]);

  // 웹툰이 로드되면 브레드크럼 네비게이션을 위해 store에 설정
  useEffect(() => {
    setSelectedWebtoon(currentWebtoon);
  }, [currentWebtoon, setSelectedWebtoon]);

  // 정렬된 회차 목록 ("기타" 회차는 맨 위, 나머지는 회차순)
  const sortedEpisodes = [...episodes].sort((a, b) => {
    if (a.episode_number === 0) return -1;
    if (b.episode_number === 0) return 1;
    return a.episode_number - b.episode_number;
  });

  const handleCreate = () => {
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
      await loadEpisodes();
      alert('회차가 삭제되었습니다.');
    } catch (error) {
      console.error('회차 삭제 실패:', error);
      alert('회차 삭제에 실패했습니다.');
    }
  };

  const handleSave = async () => {
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
          webtoon_id: webtoon.id,
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
    if (!profile || !canEditContent(profile.role)) return;
    if (currentWebtoon.unit_type === newUnitType) return;

    const newUnitLabel = newUnitType === 'cut' ? '컷' : '페이지';
    const currentUnitLabel = unitTypeLabel;
    
    if (!confirm(`관리 단위를 "${currentUnitLabel}"에서 "${newUnitLabel}"로 변경하시겠습니까?`)) {
      return;
    }

    try {
      setUpdatingUnitType(true);
      const updatedWebtoon = await updateWebtoon(webtoon.id, { unit_type: newUnitType });
      setCurrentWebtoon(updatedWebtoon);
      // Zustand 스토어도 업데이트
      const { webtoons } = useStore.getState();
      const updatedWebtoons = webtoons.map(w => w.id === updatedWebtoon.id ? updatedWebtoon : w);
      setWebtoons(updatedWebtoons);
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

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  const unitType = currentWebtoon.unit_type || 'cut';
  const unitTypeLabel = unitType === 'cut' ? '컷' : '페이지';

  return (
    <>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {/* 페이지 헤더 + 툴바 영역 */}
        <div className="mb-6">
          {/* 상단: 제목 + 관리단위 + 새 회차 버튼 */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{currentWebtoon.title}</h2>
              {profile && canEditContent(profile.role) && (
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-xs text-muted-foreground">관리단위:</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
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
            {profile && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => setCharacterDialogOpen(true)}
                >
                  <Users className="h-4 w-4" />
                  캐릭터 관리
                </Button>
                {canCreateContent(profile.role) && (
                  <Button onClick={handleCreate} size="sm" className="h-9 gap-1.5">
                    <Plus className="h-4 w-4" />
                    새 회차
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AI 도구 카드 */}
        <div className="mb-4">
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">AI 도구</span>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/monster-generator?webtoonId=${webtoon.id}`}>
                    <Button variant="default" size="sm" className="gap-2 bg-primary hover:bg-primary/90">
                      <Sparkles className="h-4 w-4" />
                      랜덤 괴수 생성기
                    </Button>
                  </Link>
                  <Link href={`/3d-viewer?webtoonId=${webtoon.id}`}>
                    <Button variant="default" size="sm" className="gap-2 bg-primary hover:bg-primary/90">
                      <Box className="h-4 w-4" />
                      캐릭터 자세 만들기
                    </Button>
                  </Link>
                  <Link href={`/script-to-storyboard?webtoonId=${webtoon.id}`}>
                    <Button variant="default" size="sm" className="gap-2 bg-primary hover:bg-primary/90">
                      <FileText className="h-4 w-4" />
                      대본to콘티
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 빈 상태 */}
        {episodes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-base font-medium">등록된 회차가 없습니다.</p>
              <p className="text-sm mt-1">새 회차를 추가해주세요.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-4">
            {sortedEpisodes.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                isSelected={false}
                onClick={() => router.push(`/webtoons/${webtoon.id}/episodes/${episode.id}`)}
                onEdit={(e) => handleEdit(episode, e)}
                onDelete={(e) => handleDelete(episode, e)}
                profile={profile}
              />
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

      {/* 캐릭터 관리 Dialog */}
      <CharacterManagementDialog
        open={characterDialogOpen}
        onOpenChange={setCharacterDialogOpen}
        webtoon={currentWebtoon}
      />
    </>
  );
}


