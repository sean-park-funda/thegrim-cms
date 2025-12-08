'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getWebtoons, createWebtoon, updateWebtoon, deleteWebtoon } from '@/lib/api/webtoons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Film, MoreVertical, Edit, Trash2, FileImage, Sparkles, X, Upload, ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Webtoon, supabase } from '@/lib/supabase';
import { canCreateContent, canEditContent, canDeleteContent, UserRole } from '@/lib/utils/permissions';
import { ReferenceFileDialog } from './ReferenceFileDialog';

// 상수
const MAX_WEBTOONS = 10;

// 상태 뱃지 컬러 매핑
const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '연재중' },
  completed: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '완결' },
  private: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: '비공개' },
  review: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '검수중' },
};

// 날짜 포맷 함수
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.', '');
}

// 웹툰 카드 컴포넌트
interface WebtoonCardProps {
  webtoon: Webtoon;
  isSelected: boolean;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onManageReferences: (e: React.MouseEvent) => void;
  profile: { role: UserRole } | null;
}

function WebtoonCard({ webtoon, isSelected, onClick, onEdit, onDelete, onManageReferences, profile }: WebtoonCardProps) {
  const statusStyle = STATUS_BADGE_STYLES[webtoon.status || 'active'] || STATUS_BADGE_STYLES.active;
  const isPrivate = webtoon.status === 'private';

  return (
    <div
      className={`
        group cursor-pointer rounded-xl overflow-hidden
        bg-card border transition-all duration-200 ease-out
        hover:scale-[1.02] hover:shadow-xl
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border/50 hover:border-border'}
        ${isPrivate ? 'opacity-70' : ''}
      `}
      style={{ aspectRatio: '4/5' }}
      onClick={onClick}
    >
      {/* 썸네일 영역 (70%) */}
      <div className="relative h-[70%] bg-muted/50 overflow-hidden">
        {/* 썸네일 이미지 또는 플레이스홀더 */}
        {webtoon.thumbnail_url ? (
          <img
            src={webtoon.thumbnail_url}
            alt={webtoon.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/80 to-muted">
            <Film className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}

        {/* 비공개 오버레이 */}
        {isPrivate && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px]" />
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
                <DropdownMenuItem onClick={onManageReferences}>
                  <FileImage className="h-4 w-4 mr-2" />
                  레퍼런스 파일 관리
                </DropdownMenuItem>
                {canEditContent(profile.role) && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    수정
                  </DropdownMenuItem>
                )}
                {canDeleteContent(profile.role) && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* 정보 영역 (30%) */}
      <div className="h-[30%] p-3 flex flex-col justify-between">
        {/* 제목 */}
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight">
          {webtoon.title}
        </h3>

        {/* 하단 정보 */}
        <div className="space-y-1">
          {/* 설명 */}
          {webtoon.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {webtoon.description}
            </p>
          )}
          {/* 최근 업데이트 */}
          <p className="text-xs text-muted-foreground/70">
            업데이트 {formatDate(webtoon.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

// 모듈 레벨 변수로 전역 로딩 상태 관리 (여러 컴포넌트 인스턴스 간 공유)
let isLoadingGlobally = false;
let hasLoadedGlobally = false;

export function WebtoonList() {
  const router = useRouter();
  const { webtoons, setWebtoons, selectedWebtoon, setSelectedWebtoon, profile } = useStore();
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWebtoon, setEditingWebtoon] = useState<Webtoon | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', thumbnail_url: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [referenceFileDialogOpen, setReferenceFileDialogOpen] = useState(false);
  const [selectedWebtoonForReference, setSelectedWebtoonForReference] = useState<Webtoon | null>(null);

  // 최대 개수 도달 여부
  const isMaxReached = webtoons.length >= MAX_WEBTOONS;

  const loadWebtoons = useCallback(async () => {
    // 이미 로딩 중이거나 데이터가 있으면 중복 호출 방지
    if (isLoadingGlobally || webtoons.length > 0 || hasLoadedGlobally) {
      return;
    }
    try {
      isLoadingGlobally = true;
      hasLoadedGlobally = true;
      setLoading(true);
      const data = await getWebtoons();
      setWebtoons(data);
    } catch (error) {
      console.error('웹툰 목록 로드 실패:', error);
      alert('웹툰 목록을 불러오는데 실패했습니다.');
      hasLoadedGlobally = false; // 실패 시 다시 시도 가능하도록
    } finally {
      isLoadingGlobally = false;
      setLoading(false);
    }
  }, [setWebtoons, webtoons.length]);

  useEffect(() => {
    // 웹툰 목록이 이미 로드되어 있으면 다시 로드하지 않음
    if (webtoons.length === 0 && !hasLoadedGlobally && !isLoadingGlobally) {
      loadWebtoons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 한 번만 실행

  const handleCreate = () => {
    setFormData({ title: '', description: '', thumbnail_url: '' });
    setThumbnailPreview(null);
    setEditingWebtoon(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (webtoon: Webtoon, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWebtoon(webtoon);
    setFormData({
      title: webtoon.title,
      description: webtoon.description || '',
      thumbnail_url: webtoon.thumbnail_url || ''
    });
    setThumbnailPreview(webtoon.thumbnail_url || null);
    setEditDialogOpen(true);
  };

  // 썸네일 업로드 핸들러
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 검증 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    try {
      setUploading(true);

      // 파일명 생성 (고유하게)
      const fileExt = file.name.split('.').pop();
      const fileName = `webtoon-thumbnail-${Date.now()}.${fileExt}`;
      const filePath = `webtoon-thumbnails/${fileName}`;

      // Supabase Storage에 업로드
      const { error: uploadError } = await supabase.storage
        .from('webtoon-files')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 공개 URL 가져오기
      const { data: { publicUrl } } = supabase.storage
        .from('webtoon-files')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, thumbnail_url: publicUrl }));
      setThumbnailPreview(publicUrl);
    } catch (error) {
      console.error('썸네일 업로드 실패:', error);
      alert('썸네일 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // 썸네일 삭제 핸들러
  const handleThumbnailRemove = () => {
    setFormData(prev => ({ ...prev, thumbnail_url: '' }));
    setThumbnailPreview(null);
  };

  const handleManageReferences = (webtoon: Webtoon, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWebtoonForReference(webtoon);
    setReferenceFileDialogOpen(true);
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
        await updateWebtoon(editingWebtoon.id, {
          title: formData.title,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url || undefined
        });
        alert('웹툰이 수정되었습니다.');
      } else {
        await createWebtoon({
          title: formData.title,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url || undefined
        });
        alert('웹툰이 생성되었습니다.');
      }
      await loadWebtoons();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setEditingWebtoon(null);
      setFormData({ title: '', description: '', thumbnail_url: '' });
      setThumbnailPreview(null);
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
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {/* 새 웹툰 버튼 */}
        {profile && canCreateContent(profile.role) && (
          <div className="flex justify-end mb-6">
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreate();
              }}
              disabled={isMaxReached}
              title={isMaxReached ? `최대 ${MAX_WEBTOONS}개까지 생성 가능합니다.` : '새 웹툰 추가'}
              size="sm"
              className="h-9 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              새 웹툰
            </Button>
          </div>
        )}

        {/* 빈 상태 */}
        {webtoons.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Film className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-base font-medium">등록된 웹툰이 없습니다.</p>
              <p className="text-sm mt-1">새 웹툰을 추가해주세요.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-4">
            {webtoons.map((webtoon) => (
              <WebtoonCard
                key={webtoon.id}
                webtoon={webtoon}
                isSelected={selectedWebtoon?.id === webtoon.id}
                onClick={() => setSelectedWebtoon(webtoon)}
                onEdit={(e) => handleEdit(webtoon, e)}
                onDelete={(e) => handleDelete(webtoon, e)}
                onManageReferences={(e) => handleManageReferences(webtoon, e)}
                profile={profile}
              />
            ))}
            {/* 생성 히스토리 버튼 */}
            <div
              className="group cursor-pointer rounded-xl overflow-hidden border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
              style={{ aspectRatio: '4/5' }}
              onClick={() => router.push('/regenerated-images')}
            >
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Sparkles className="h-10 w-10 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  생성 히스토리
                </span>
              </div>
            </div>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>웹툰 수정</DialogTitle>
            <DialogDescription>웹툰 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 대표 이미지 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">대표 이미지</label>
              <div className="flex items-start gap-4">
                {/* 미리보기 */}
                <div className="relative w-24 h-30 rounded-lg overflow-hidden bg-muted border border-border flex-shrink-0" style={{ aspectRatio: '4/5' }}>
                  {thumbnailPreview ? (
                    <>
                      <img
                        src={thumbnailPreview}
                        alt="썸네일 미리보기"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleThumbnailRemove}
                        className="absolute top-1 right-1 p-1 bg-background/80 rounded-full hover:bg-background transition-colors"
                        aria-label="이미지 삭제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                {/* 업로드 버튼 */}
                <div className="flex-1 space-y-2">
                  <label
                    htmlFor="thumbnail-upload"
                    className={`
                      inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                      border border-input bg-background hover:bg-accent hover:text-accent-foreground
                      cursor-pointer transition-colors
                      ${uploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? '업로드 중...' : '이미지 선택'}
                  </label>
                  <input
                    id="thumbnail-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    권장: 4:5 비율, 최대 5MB
                  </p>
                </div>
              </div>
            </div>

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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving || uploading}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? '저장 중...' : '수정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 레퍼런스 파일 관리 Dialog */}
      {selectedWebtoonForReference && (
        <ReferenceFileDialog
          open={referenceFileDialogOpen}
          onOpenChange={setReferenceFileDialogOpen}
          webtoon={selectedWebtoonForReference}
        />
      )}
    </>
  );
}


