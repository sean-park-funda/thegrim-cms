'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { searchFiles, analyzeImage, deleteFile } from '@/lib/api/files';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileIcon, Search, Download, Trash2, Sparkles, Calendar, HardDrive, X } from 'lucide-react';
import { FileWithRelations } from '@/lib/supabase';
import Image from 'next/image';
import { format } from 'date-fns';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';

export function SearchResults() {
  const { activeSearchQuery, profile, setSearchQuery, setActiveSearchQuery } = useStore();
  const [results, setResults] = useState<FileWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [fileToView, setFileToView] = useState<FileWithRelations | null>(null);
  const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeSearchQuery.trim().length >= 1) {
      performSearch();
    } else {
      setResults([]);
    }
  }, [activeSearchQuery]);

  const performSearch = async () => {
    try {
      setLoading(true);
      setImageErrors(new Set()); // 검색 시 이미지 에러 상태 초기화
      const data = await searchFiles(activeSearchQuery);
      setResults(data);
    } catch (error: any) {
      console.error('검색 실패:', {
        query: activeSearchQuery,
        error: error?.message || error,
        details: error?.details,
        code: error?.code
      });
      // 사용자에게 에러 표시
      setResults([]);
      setImageErrors(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: FileWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(file.file_path);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('파일 다운로드 실패:', error);
      alert('파일 다운로드에 실패했습니다.');
    }
  };

  const handleDeleteClick = async (file: FileWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${file.file_name}" 파일을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteFile(file.id);
      // 검색 결과에서 제거
      setResults(prev => prev.filter(f => f.id !== file.id));
      setDetailDialogOpen(false);
      alert('파일이 삭제되었습니다.');
    } catch (error: any) {
      console.error('파일 삭제 실패:', error);
      alert(error.message || '파일 삭제에 실패했습니다.');
    }
  };

  const handleAnalyzeClick = async (file: FileWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file || file.file_type !== 'image') return;

    try {
      setAnalyzingFiles(prev => new Set(prev).add(file.id));
      await analyzeImage(file.id);
      // 검색 결과 새로고침
      await performSearch();
      alert('이미지 분석이 완료되었습니다.');
    } catch (error: any) {
      console.error('이미지 분석 실패:', error);
      alert(error.message || '이미지 분석에 실패했습니다.');
    } finally {
      setAnalyzingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const renderFilePreview = (file: FileWithRelations) => {
    const isImage = file.file_type === 'image';
    const hasError = imageErrors.has(file.id);

    if (isImage && !hasError) {
      // 이미지 URL이 절대 URL인지 확인하고, 상대 경로인 경우 처리
      const imageUrl = file.file_path?.startsWith('http') 
        ? file.file_path 
        : file.file_path?.startsWith('/') 
          ? file.file_path 
          : `https://${file.file_path}`;

      return (
        <div className="relative w-full max-w-full sm:w-32 sm:max-w-32 h-48 sm:h-32 bg-muted rounded-md overflow-hidden flex-shrink-0">
          <Image 
            src={imageUrl} 
            alt={file.file_name} 
            fill 
            className="object-cover" 
            sizes="(max-width: 640px) 100vw, 128px"
            unoptimized={true}
            onError={() => {
              console.error('이미지 로딩 실패:', imageUrl, file.id);
              setImageErrors(prev => new Set(prev).add(file.id));
            }}
          />
        </div>
      );
    }

    return (
      <div className="w-full max-w-full sm:w-32 sm:max-w-32 h-48 sm:h-32 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
        <FileIcon className="h-12 w-12 text-muted-foreground" />
      </div>
    );
  };

  if (!activeSearchQuery || activeSearchQuery.trim().length < 1) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>검색어를 입력하고 Enter를 누르세요</p>
      </div>
    );
  }

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery('');
  };

  if (loading) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          <div className="mb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold">검색 중...</h2>
                <p className="text-sm text-muted-foreground">
                  &quot;{activeSearchQuery}&quot; 검색 중...
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSearch}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="검색 초기화"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="p-8 text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-2 opacity-50 animate-pulse" />
            <p>검색 중...</p>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold">검색 결과</h2>
              <p className="text-sm text-muted-foreground">
                &quot;{activeSearchQuery}&quot;에 대한 {results.length}개의 결과
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSearch}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
              aria-label="검색 초기화"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {results.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>검색 결과가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {results.map((file) => (
              <Card 
                key={file.id} 
                className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                onClick={() => {
                  setFileToView(file);
                  setDetailDialogOpen(true);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-4 min-w-0">
                    {renderFilePreview(file)}
                    <div className="flex-1 min-w-0 w-full sm:w-auto">
                      <div className="mb-2">
                        <p className="font-medium truncate">{file.file_name}</p>
                        {file.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                        )}
                        {(() => {
                          const metadata = file.metadata as {
                            scene_summary?: string;
                            tags?: string[];
                          } | undefined;
                          const hasMetadata = metadata && metadata.scene_summary && metadata.tags;
                          return hasMetadata ? (
                            <div className="mt-2 space-y-2">
                              {metadata.scene_summary && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{metadata.scene_summary}</p>
                              )}
                              {metadata.tags && metadata.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {metadata.tags.slice(0, 5).map((tag, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {metadata.tags.length > 5 && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      +{metadata.tags.length - 5}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      {file.cut?.episode?.webtoon && (
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">{file.cut.episode.webtoon.title}</span>
                            {' · '}
                            {file.cut.episode.episode_number}화
                            {' · '}
                            컷 {file.cut.cut_number}
                          </p>
                          {file.process && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: file.process.color }} />
                              <span className="text-muted-foreground">{file.process.name}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 파일 상세 정보 Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] !top-[2.5vh] !left-[2.5vw] !translate-x-0 !translate-y-0 !sm:max-w-[95vw] overflow-y-auto p-6">
          {fileToView && (
            <>
              <DialogTitle asChild>
                <h2 className="text-xl font-semibold break-words mb-0">{fileToView.file_name}</h2>
              </DialogTitle>
              <div className="space-y-6">
              {/* 파일 미리보기 */}
              <div className="w-full">
                {fileToView.file_type === 'image' && !imageErrors.has(fileToView.id) ? (
                  <div className="relative w-full h-[60vh] min-h-[400px] bg-muted rounded-md overflow-hidden">
                    <Image 
                      src={fileToView.file_path?.startsWith('http') 
                        ? fileToView.file_path 
                        : fileToView.file_path?.startsWith('/') 
                          ? fileToView.file_path 
                          : `https://${fileToView.file_path}`} 
                      alt={fileToView.file_name} 
                      fill 
                      className="object-contain" 
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                      unoptimized={true}
                      onError={() => {
                        console.error('이미지 로딩 실패:', fileToView.file_path);
                        setImageErrors(prev => new Set(prev).add(fileToView.id));
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-[60vh] min-h-[400px] bg-muted rounded-md flex items-center justify-center">
                    <div className="text-center">
                      <FileIcon className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                      {fileToView.file_type === 'image' && (
                        <p className="text-sm text-muted-foreground">이미지를 불러올 수 없습니다</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 기본 정보 및 메타데이터 */}
              <div className="flex flex-col md:flex-row gap-4">
                {/* 기본 정보 카드 */}
                <Card className="flex-1">
                  <CardHeader>
                    <CardTitle className="text-base">기본 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">파일명</span>
                      <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{fileToView.file_name}</span>
                    </div>
                    {fileToView.file_size && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          파일 크기
                        </span>
                        <span className="text-sm font-medium text-right flex-1 ml-4">
                          {(fileToView.file_size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    )}
                    {fileToView.mime_type && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground">MIME 타입</span>
                        <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{fileToView.mime_type}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        생성일
                      </span>
                      <span className="text-sm font-medium text-right flex-1 ml-4">
                        {format(new Date(fileToView.created_at), 'yyyy년 MM월 dd일 HH:mm')}
                      </span>
                    </div>
                    {fileToView.description && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">설명</p>
                        <p className="text-sm">{fileToView.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 메타데이터 카드 */}
                {fileToView.file_type === 'image' && (
                  <Card className="flex-1">
                    <CardHeader>
                      <CardTitle className="text-base">메타데이터</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const metadata = fileToView.metadata as {
                          scene_summary?: string;
                          tags?: string[];
                          characters_count?: number;
                          analyzed_at?: string;
                        } | undefined;
                        
                        if (metadata && metadata.scene_summary && metadata.tags) {
                          return (
                            <div className="space-y-3">
                              {metadata.scene_summary && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">장면 요약</p>
                                  <p className="text-sm">{metadata.scene_summary}</p>
                                </div>
                              )}
                              {metadata.tags && metadata.tags.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-2">태그</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {metadata.tags.map((tag, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {typeof metadata.characters_count === 'number' && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">등장 인물 수</p>
                                  <p className="text-sm">{metadata.characters_count}명</p>
                                </div>
                              )}
                              {metadata.analyzed_at && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">분석 일시</p>
                                  <p className="text-sm">
                                    {format(new Date(metadata.analyzed_at), 'yyyy년 MM월 dd일 HH:mm')}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Sparkles className="h-4 w-4" />
                              <span>메타데이터가 없습니다. 분석 버튼을 눌러 생성하세요.</span>
                            </div>
                          );
                        }
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(fileToView, e);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
                {fileToView.file_type === 'image' && profile && canUploadFile(profile.role) && (
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailDialogOpen(false);
                      handleAnalyzeClick(fileToView, e);
                    }}
                    disabled={analyzingFiles.has(fileToView.id)}
                  >
                    <Sparkles className={`h-4 w-4 mr-2 ${analyzingFiles.has(fileToView.id) ? 'animate-pulse' : ''}`} />
                    {analyzingFiles.has(fileToView.id) ? '분석 중...' : '분석'}
                  </Button>
                )}
                {profile && canDeleteFile(profile.role) && (
                  <Button 
                    variant="destructive" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailDialogOpen(false);
                      handleDeleteClick(fileToView, e);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </Button>
                )}
              </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}


