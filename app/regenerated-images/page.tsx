'use client';

import { useState, useEffect, useCallback, Suspense, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ChevronRight, ChevronLeft, Calendar, User, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RemixImageDialog } from '@/components/RemixImageDialog';
import { format } from 'date-fns';
import { ImageViewer } from '@/components/ImageViewer';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStore } from '@/lib/store/useStore';

interface HistoryItem {
  fileId: string;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  mimeType: string;
  prompt?: string;
  sourceFileId?: string;
  description?: string;
  metadata?: {
    width?: number;
    height?: number;
    tags?: string[];
    scene_summary?: string;
    aspectRatio?: string;
    source?: string;
    [key: string]: any;
  };
  sourceFile?: {
    id: string;
    filePath: string;
    fileUrl: string;
    fileName: string;
    prompt?: string | null;
    description?: string;
    metadata?: any;
  };
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  webtoon?: {
    id: string;
    title: string;
  };
  episode?: {
    id: string;
    episodeNumber: number;
    title: string;
  };
  cut?: {
    id: string;
    cutNumber: number;
    title: string;
  };
  process?: {
    id: string;
    name: string;
    color: string;
  };
}

const PAGE_SIZE = 10; // 페이지 사이즈는 10으로 고정

function RegeneratedImagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useStore();
  const [images, setImages] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerImageTitle, setViewerImageTitle] = useState<string>('');
  const [imageCache, setImageCache] = useState<Map<number, HistoryItem[]>>(new Map());
  const [remixDialogOpen, setRemixDialogOpen] = useState(false);
  const [selectedImageForRemix, setSelectedImageForRemix] = useState<HistoryItem | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<'public' | 'private'>('public');

  // 필터 변경 시 캐시 초기화 및 페이지 리셋
  const handleVisibilityChange = (visibility: 'public' | 'private') => {
    if (visibility !== visibilityFilter) {
      setVisibilityFilter(visibility);
      setImageCache(new Map());
      setCurrentPage(1);
      setPageInput('1');
      setImages([]);
    }
  };

  // 브라우저 이미지 프리로드
  const preloadImage = useCallback((url: string) => {
    if (typeof window !== 'undefined') {
      const img = new window.Image();
      img.src = url;
    }
  }, []);

  // 이전/다음 페이지 프리로드
  const preloadAdjacentPages = useCallback(async (page: number, totalPages: number, currentCache: Map<number, HistoryItem[]>) => {
    const pagesToPreload: number[] = [];
    
    if (page > 1) pagesToPreload.push(page - 1);
    if (page < totalPages) pagesToPreload.push(page + 1);
    
    if (pagesToPreload.length === 0) return;
    
    // 이미 캐시에 있으면 스킵
    const pagesToFetch = pagesToPreload.filter(p => !currentCache.has(p));
    
    if (pagesToFetch.length === 0) return;
    
    // 병렬로 프리로드
    await Promise.all(pagesToFetch.map(async (p) => {
      try {
        const offset = (p - 1) * PAGE_SIZE;
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), visibility: visibilityFilter });
        if (profile?.id) params.set('currentUserId', profile.id);
        const response = await fetch(`/api/regenerate-image-history?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.history && data.history.length > 0) {
            setImageCache(prev => new Map(prev).set(p, data.history));
            // 브라우저 이미지 프리로드
            data.history.forEach((image: HistoryItem) => {
              preloadImage(image.fileUrl);
            });
          }
        }
      } catch (error) {
        console.error(`페이지 ${p} 프리로드 실패:`, error);
      }
    }));
  }, [preloadImage]);

  // URL 파라미터에서 페이지 번호 읽기
  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) {
      const page = parseInt(pageParam, 10);
      if (page > 0) {
        setCurrentPage(page);
        setPageInput(page.toString());
      }
    }
  }, [searchParams]);

  // 이미지 로드
  useEffect(() => {
    const loadImages = async () => {
      // 캐시 확인
      if (imageCache.has(currentPage)) {
        const cachedImages = imageCache.get(currentPage)!;
        setImages(cachedImages);
        setLoading(false);
        // 캐시에서 로드했어도 total 정보는 항상 확인 (최신 정보 유지)
        try {
          const totalParams = new URLSearchParams({ limit: '1', offset: '0', visibility: visibilityFilter });
        if (profile?.id) totalParams.set('currentUserId', profile.id);
        const response = await fetch(`/api/regenerate-image-history?${totalParams.toString()}`);
          if (response.ok) {
            const data = await response.json();
            if (data.total !== undefined) {
              setTotalCount(data.total);
              const calculatedTotalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
              setTotalPages(calculatedTotalPages);
              // 프리로드 실행
              preloadAdjacentPages(currentPage, calculatedTotalPages, imageCache);
            }
          }
        } catch (error) {
          console.error('전체 개수 조회 실패:', error);
          // 에러가 나도 기존 totalPages로 프리로드 시도
          if (totalPages > 0) {
            preloadAdjacentPages(currentPage, totalPages, imageCache);
          }
        }
        return;
      }
      
      // 캐시 미스 - API 호출
      setLoading(true);
      try {
        const offset = (currentPage - 1) * PAGE_SIZE;
        const freshParams = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), visibility: visibilityFilter });
        if (profile?.id) freshParams.set('currentUserId', profile.id);
        const response = await fetch(`/api/regenerate-image-history?${freshParams.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.history && data.history.length > 0) {
            setImages(data.history);
            // 캐시에 저장
            setImageCache(prev => new Map(prev).set(currentPage, data.history));
            // 브라우저 이미지 프리로드
            data.history.forEach((image: HistoryItem) => {
              preloadImage(image.fileUrl);
            });
          } else {
            setImages([]);
          }
          if (data.total !== undefined) {
            setTotalCount(data.total);
            const calculatedTotalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
            setTotalPages(calculatedTotalPages);
            // 이미지 로드 완료 후 이전/다음 페이지 프리로드
            // 캐시에 현재 이미지가 추가된 상태이므로 최신 캐시 사용
            const updatedCache = new Map(imageCache).set(currentPage, data.history);
            preloadAdjacentPages(currentPage, calculatedTotalPages, updatedCache);
          }
        }
      } catch (error) {
        console.error('이미지 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, visibilityFilter]);

  // 이전 페이지
  const handlePrevious = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      setPageInput(newPage.toString());
      router.push(`/regenerated-images?page=${newPage}`);
    }
  };

  // 다음 페이지
  const handleNext = () => {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      setPageInput(newPage.toString());
      router.push(`/regenerated-images?page=${newPage}`);
    }
  };

  // 페이지 번호로 이동
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setPageInput(page.toString());
      router.push(`/regenerated-images?page=${page}`);
    }
  };

  // 페이지 입력 처리
  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInput, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        handlePageChange(page);
      } else {
        setPageInput(currentPage.toString());
      }
    }
  };

  // 페이지 입력 블러 처리
  const handlePageInputBlur = () => {
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 1 || page > totalPages) {
      setPageInput(currentPage.toString());
    }
  };

  const handleImageClick = (image: HistoryItem) => {
    setViewerImageUrl(image.fileUrl);
    setViewerImageTitle(`생성된 이미지 - ${format(new Date(image.createdAt), 'yyyy-MM-dd HH:mm')}`);
  };

  const handleRemixClick = (e: React.MouseEvent, image: HistoryItem) => {
    e.stopPropagation();
    setSelectedImageForRemix(image);
    setRemixDialogOpen(true);
  };

  return (
    <Fragment>
      <ScrollArea className="h-full">
      <div className="container mx-auto px-4 pt-4 pb-8">
          {/* 상단 필터 토글 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant={visibilityFilter === 'public' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleVisibilityChange('public')}
                className="gap-1.5"
              >
                <Eye className="h-4 w-4" />
                퍼블릭
              </Button>
              <Button
                variant={visibilityFilter === 'private' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleVisibilityChange('private')}
                className="gap-1.5"
                disabled={!profile?.id}
              >
                <EyeOff className="h-4 w-4" />
                프라이빗
              </Button>
            </div>
            {visibilityFilter === 'private' && (
              <span className="text-xs text-muted-foreground">내가 만든 비공개 이미지만 표시됩니다</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-24">
                <p className="text-muted-foreground">생성된 이미지가 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* 이미지 그리드 */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {images.map((image) => (
                  <Card
                    key={image.fileId}
                    className="overflow-hidden p-0 hover:shadow-md transition-all duration-200 ease-in-out"
                  >
                    <div 
                      className="relative w-full h-40 sm:h-48 bg-muted rounded-md overflow-hidden cursor-pointer"
                      onClick={() => handleImageClick(image)}
                    >
                      <Image
                        src={image.fileUrl}
                        alt="생성된 이미지"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        unoptimized={true}
                        onError={(e) => {
                          console.error('[이미지 로드 실패]', {
                            fileId: image.fileId,
                            fileUrl: image.fileUrl,
                          });
                        }}
                      />
                    </div>
                    <div className="p-2 sm:p-3 space-y-2">
                      {/* 첫 번째 줄: 작업자, 날짜 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {image.creator && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground truncate max-w-[100px]">{image.creator.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                          <Calendar className="h-3 w-3" />
                          <span className="truncate">
                            {format(new Date(image.createdAt), 'MM-dd HH:mm')}
                          </span>
                        </div>
                      </div>
                      
                      {/* 두 번째 줄: 웹툰/에피소드/컷 경로 */}
                      {(image.webtoon || image.episode || image.cut) && (
                        <div className="text-[10px] text-muted-foreground line-clamp-1">
                          {image.webtoon?.title}
                          {image.episode && ` > ${image.episode.episodeNumber}화`}
                          {image.cut && ` > ${image.cut.cutNumber}${image.cut.title ? `: ${image.cut.title}` : ''}`}
                        </div>
                      )}
                      
                      {/* 세 번째 줄: 프롬프트 */}
                      {image.prompt && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {image.prompt}
                        </p>
                      )}
                      
                      {/* 네 번째 줄: 태그 */}
                      {image.metadata?.tags && Array.isArray(image.metadata.tags) && image.metadata.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {image.metadata.tags.slice(0, 3).map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {tag}
                            </Badge>
                          ))}
                          {image.metadata.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{image.metadata.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                      
                      {/* 리믹스 버튼 */}
                      {(image.sourceFileId || image.sourceFile?.id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 h-7 text-xs"
                          onClick={(e) => handleRemixClick(e, image)}
                        >
                          <Sparkles className="h-3 w-3 mr-1.5" />
                          리믹스
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {/* 페이지네이션 */}
              <div className="flex flex-col items-center gap-4 pb-4">
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Button
                    onClick={handlePrevious}
                    disabled={currentPage <= 1 || loading}
                    variant="outline"
                    size="sm"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    이전
                  </Button>

                  {/* 페이지 번호 버튼들 */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        // 전체 페이지가 5개 이하면 모두 표시
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        // 현재 페이지가 앞쪽이면 1-5 표시
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        // 현재 페이지가 뒤쪽이면 마지막 5개 표시
                        pageNum = totalPages - 4 + i;
                      } else {
                        // 중간이면 현재 페이지 기준 앞뒤 2개씩
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <Button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          disabled={loading}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          className="min-w-[2.5rem]"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  {/* 페이지 입력 필드 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">이동</span>
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={handlePageInputKeyDown}
                      onBlur={handlePageInputBlur}
                      className="w-16 h-9 text-center"
                      disabled={loading}
                    />
                    <span className="text-sm text-muted-foreground">/ {totalPages}</span>
                  </div>

                  <Button
                    onClick={handleNext}
                    disabled={currentPage >= totalPages || loading}
                    variant="outline"
                    size="sm"
                  >
                    다음
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  전체 {totalCount}개 중 {currentPage}페이지
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 이미지 뷰어 */}
      {viewerImageUrl && (
        <ImageViewer
          imageUrl={viewerImageUrl}
          imageName={viewerImageTitle}
          open={!!viewerImageUrl}
          onOpenChange={(open) => {
            if (!open) {
              setViewerImageUrl(null);
              setViewerImageTitle('');
            }
          }}
        />
      )}

      {/* 리믹스 Dialog */}
      <RemixImageDialog
        open={remixDialogOpen}
        onOpenChange={(open) => {
          setRemixDialogOpen(open);
          if (!open) {
            setSelectedImageForRemix(null);
          }
        }}
        image={selectedImageForRemix}
      />
    </Fragment>
  );
}

export default function RegeneratedImagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <RegeneratedImagesContent />
    </Suspense>
  );
}

