'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ImageViewer } from '@/components/ImageViewer';
import { Navigation } from '@/components/Navigation';
import { Input } from '@/components/ui/input';

interface HistoryItem {
  fileId: string;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  mimeType: string;
  prompt?: string;
  sourceFileId?: string;
}

const PAGE_SIZE = 1; // 페이지 사이즈는 1로 고정

function RegeneratedImagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentImage, setCurrentImage] = useState<HistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerImageTitle, setViewerImageTitle] = useState<string>('');
  const [imageCache, setImageCache] = useState<Map<number, HistoryItem>>(new Map());

  // 브라우저 이미지 프리로드
  const preloadImage = useCallback((url: string) => {
    if (typeof window !== 'undefined') {
      const img = new window.Image();
      img.src = url;
    }
  }, []);

  // 이전/다음 페이지 프리로드
  const preloadAdjacentPages = useCallback(async (page: number, totalPages: number, currentCache: Map<number, HistoryItem>) => {
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
        const response = await fetch(`/api/regenerate-image-history?limit=${PAGE_SIZE}&offset=${offset}`);
        if (response.ok) {
          const data = await response.json();
          if (data.history && data.history.length > 0) {
            const image = data.history[0];
            setImageCache(prev => new Map(prev).set(p, image));
            // 브라우저 이미지 프리로드
            preloadImage(image.fileUrl);
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
    const loadImage = async () => {
      // 캐시 확인
      if (imageCache.has(currentPage)) {
        const cachedImage = imageCache.get(currentPage)!;
        setCurrentImage(cachedImage);
        setLoading(false);
        // 캐시에서 로드했어도 total 정보는 항상 확인 (최신 정보 유지)
        try {
          const response = await fetch(`/api/regenerate-image-history?limit=1&offset=0`);
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
        const response = await fetch(`/api/regenerate-image-history?limit=${PAGE_SIZE}&offset=${offset}`);
        if (response.ok) {
          const data = await response.json();
          let loadedImage: HistoryItem | null = null;
          if (data.history && data.history.length > 0) {
            loadedImage = data.history[0];
            setCurrentImage(loadedImage);
            // 캐시에 저장
            setImageCache(prev => new Map(prev).set(currentPage, loadedImage!));
            // 브라우저 이미지 프리로드
            preloadImage(loadedImage.fileUrl);
          } else {
            setCurrentImage(null);
          }
          if (data.total !== undefined) {
            setTotalCount(data.total);
            const calculatedTotalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
            setTotalPages(calculatedTotalPages);
            // 이미지 로드 완료 후 이전/다음 페이지 프리로드
            // 캐시에 현재 이미지가 추가된 상태이므로 최신 캐시 사용
            if (loadedImage) {
              const updatedCache = new Map(imageCache).set(currentPage, loadedImage);
              preloadAdjacentPages(currentPage, calculatedTotalPages, updatedCache);
            }
          }
        }
      } catch (error) {
        console.error('이미지 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };
    loadImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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

  const handleImageClick = () => {
    if (currentImage) {
      setViewerImageUrl(currentImage.fileUrl);
      setViewerImageTitle(`생성된 이미지 - ${format(new Date(currentImage.createdAt), 'yyyy-MM-dd HH:mm')}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 pt-4 max-w-4xl">

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !currentImage ? (
          <Card>
            <CardContent className="flex items-center justify-center py-24">
              <p className="text-muted-foreground">생성된 이미지가 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* 이미지 */}
                  <div
                    className="relative w-full aspect-auto bg-muted rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all min-h-[400px]"
                    onClick={handleImageClick}
                  >
                    {currentImage.fileUrl && (
                      <Image
                        src={currentImage.fileUrl}
                        alt="생성된 이미지"
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                        unoptimized={true}
                        onError={(e) => {
                          console.error('[이미지 로드 실패]', {
                            fileId: currentImage.fileId,
                            fileUrl: currentImage.fileUrl,
                          });
                        }}
                      />
                    )}
                  </div>

                  {/* 메타데이터 */}
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(currentImage.createdAt), 'yyyy년 MM월 dd일 HH:mm')}
                      </span>
                    </div>
                    {currentImage.prompt && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">프롬프트: </span>
                        <span className="text-foreground">{currentImage.prompt}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 페이지네이션 */}
            <div className="flex flex-col items-center gap-4">
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
    </div>
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

