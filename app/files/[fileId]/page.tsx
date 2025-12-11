'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getFileById, analyzeImage, deleteFile } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { FileWithRelations, Process } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileIcon, Download, Trash2, Sparkles, Calendar, HardDrive, Wand2, ArrowLeft, User, Search, Link2, FileSearch } from 'lucide-react';
import Image from 'next/image';
import { format } from 'date-fns';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { useStore } from '@/lib/store/useStore';
import { ImageViewer } from '@/components/ImageViewer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function FileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useStore();
  const fileId = params.fileId as string;
  const [file, setFile] = useState<FileWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
  const [processes, setProcesses] = useState<Process[]>([]);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (fileId) {
      loadFile();
      loadProcesses();
    }
  }, [fileId]);

  const loadFile = async () => {
    try {
      setLoading(true);
      const data = await getFileById(fileId);
      if (!data) {
        router.push('/webtoons');
        return;
      }
      setFile(data);
      
      // 이미지 크기 정보 로드
      if (data.file_type === 'image' && data.file_path) {
        const img = new window.Image();
        img.onload = () => {
          setImageDimensions({ width: img.width, height: img.height });
        };
        img.onerror = () => {
          setImageDimensions(null);
        };
        const imageUrl = data.file_path?.startsWith('http')
          ? data.file_path
          : data.file_path?.startsWith('/')
            ? data.file_path
            : `https://${data.file_path}`;
        img.src = imageUrl;
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
      router.push('/webtoons');
    } finally {
      setLoading(false);
    }
  };

  const loadProcesses = async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    if (!file) return;
    e.stopPropagation();
    try {
      const imageUrl = file.file_path?.startsWith('http')
        ? file.file_path
        : file.file_path?.startsWith('/')
          ? file.file_path
          : `https://${file.file_path}`;
      const response = await fetch(imageUrl);
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

  const handleImageViewerOpen = () => {
    if (!file) return;
    const imageUrl = file.file_path?.startsWith('http')
      ? file.file_path
      : file.file_path?.startsWith('/')
        ? file.file_path
        : `https://${file.file_path}`;
    setImageViewerOpen(true);
  };

  const handleAnalyzeClick = async (e: React.MouseEvent) => {
    if (!file || file.file_type !== 'image') return;
    e.stopPropagation();

    try {
      setAnalyzingFiles(prev => new Set(prev).add(file.id));
      await analyzeImage(file.id);
      await loadFile();
      alert('이미지 분석이 완료되었습니다.');
    } catch (error) {
      console.error('이미지 분석 실패:', error);
      alert('이미지 분석에 실패했습니다.');
    } finally {
      setAnalyzingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    if (!file) return;
    e.stopPropagation();
    if (!confirm(`"${file.file_name}" 파일을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteFile(file.id);
      // 이전 페이지로 이동
      router.back();
      alert('파일이 삭제되었습니다.');
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      alert('파일 삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden bg-background p-4">
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-sm">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex-1 overflow-hidden bg-background p-4">
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-sm">파일을 찾을 수 없습니다.</div>
        </div>
      </div>
    );
  }

  const metadata = file.metadata as {
    scene_summary?: string;
    tags?: string[];
    characters_count?: number;
    analyzed_at?: string;
  } | undefined;

  const hasMetadata = metadata && metadata.scene_summary && metadata.tags;
  const canUpload = profile && canUploadFile(profile.role);
  const canDelete = profile && canDeleteFile(profile.role);

  const imageUrl = file.file_path?.startsWith('http')
    ? file.file_path
    : file.file_path?.startsWith('/')
      ? file.file_path
      : `https://${file.file_path}`;

  return (
    <div className="flex-1 overflow-hidden bg-background flex flex-col h-full">
      {/* 뒤로가기 버튼 */}
      <div className="flex-shrink-0 p-3 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          뒤로가기
        </Button>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽 패널 - 기본 정보 + 메타데이터 */}
        <div className="w-[240px] flex-shrink-0 border-r h-full overflow-hidden bg-muted/30">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              {/* 파일명 */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">파일명</p>
                <p className="text-xs font-medium break-words leading-tight">{file.file_name}</p>
              </div>

              {/* 기본 정보 */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">기본 정보</p>
                
                {file.file_size && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-2.5 w-2.5" />
                      크기
                    </span>
                    <span>{(file.file_size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                )}
                
                {file.file_type === 'image' && imageDimensions && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">사이즈</span>
                    <span>{imageDimensions.width} × {imageDimensions.height}</span>
                  </div>
                )}
                
                {file.mime_type && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">타입</span>
                    <span className="truncate max-w-[100px]">{file.mime_type}</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    생성일
                  </span>
                  <span>{format(new Date(file.created_at), 'MM/dd HH:mm')}</span>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <User className="h-2.5 w-2.5" />
                    생성자
                  </span>
                  <span className="truncate max-w-[100px]">
                    {file.created_by_user?.name || '알 수 없음'}
                  </span>
                </div>
              </div>

              {/* 원본 파일 */}
              {file.source_file && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Link2 className="h-2.5 w-2.5" />
                    원본 파일
                  </p>
                  <div 
                    className="flex items-center gap-2 p-1.5 bg-background rounded cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => router.push(`/files/${file.source_file!.id}`)}
                  >
                    {file.source_file.file_type === 'image' ? (
                      <div className="relative w-8 h-8 bg-muted rounded overflow-hidden flex-shrink-0">
                        <Image
                          src={(() => {
                            const thumbnailPath = file.source_file!.thumbnail_path;
                            if (thumbnailPath) {
                              return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${thumbnailPath}`;
                            }
                            const filePath = file.source_file!.file_path;
                            return filePath?.startsWith('http') ? filePath : `https://${filePath}`;
                          })()}
                          alt={file.source_file.file_name}
                          fill
                          className="object-cover"
                          sizes="32px"
                          unoptimized={true}
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center flex-shrink-0">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs truncate flex-1">{file.source_file.file_name}</p>
                  </div>
                </div>
              )}

              {/* 설명 */}
              {file.description && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">설명</p>
                  <p className="text-xs leading-relaxed">{file.description}</p>
                </div>
              )}

              {/* 생성 프롬프트 */}
              {file.prompt && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Wand2 className="h-2.5 w-2.5" />
                    생성 프롬프트
                  </p>
                  <div className="p-2 bg-background rounded text-xs leading-relaxed break-words max-h-[120px] overflow-y-auto">
                    {file.prompt}
                  </div>
                </div>
              )}

              {/* 메타데이터 */}
              {file.file_type === 'image' && (
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">메타데이터</p>
                    {canUpload && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={handleAnalyzeClick}
                        disabled={analyzingFiles.has(file.id)}
                        title="메타데이터 분석"
                      >
                        <Sparkles className={`h-3 w-3 ${analyzingFiles.has(file.id) ? 'animate-pulse' : ''}`} />
                      </Button>
                    )}
                  </div>
                  
                  {hasMetadata ? (
                    <div className="space-y-2">
                      {metadata?.scene_summary && (
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">장면 요약</p>
                          <p className="text-xs leading-relaxed">{metadata.scene_summary}</p>
                        </div>
                      )}
                      {metadata?.tags && metadata.tags.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">태그</p>
                          <div className="flex flex-wrap gap-1">
                            {metadata.tags.map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {typeof metadata?.characters_count === 'number' && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">등장인물</span>
                          <span>{metadata.characters_count}명</span>
                        </div>
                      )}
                      {metadata?.analyzed_at && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">분석일시</span>
                          <span>{format(new Date(metadata.analyzed_at), 'MM/dd HH:mm')}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      메타데이터가 없습니다
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 중앙 패널 - 이미지 */}
        <div className="flex-1 flex items-center justify-center bg-muted/10 p-4 relative">
          {file.file_type === 'image' && !imageErrors.has(file.id) ? (
            <div 
              className="relative w-full h-full bg-muted rounded-lg overflow-hidden group cursor-pointer" 
              onClick={handleImageViewerOpen}
            >
              <Image 
                src={imageUrl} 
                alt={file.file_name} 
                fill 
                className="object-contain" 
                sizes="(max-width: 768px) 100vw, 70vw"
                unoptimized={true}
                onError={() => {
                  console.error('이미지 로딩 실패:', imageUrl);
                  setImageErrors(prev => new Set(prev).add(file.id));
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-3">
                  <Search className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
              <div className="text-center">
                <FileIcon className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                {file.file_type === 'image' && (
                  <p className="text-sm text-muted-foreground">이미지를 불러올 수 없습니다</p>
                )}
              </div>
            </div>
          )}
          
          {/* 이미지 우상단 아이콘 버튼 */}
          <div className="absolute top-6 right-6 flex gap-1.5">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(e);
              }}
              title="다운로드"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 우측 패널 - 액션 버튼 */}
        <div className="w-[100px] flex-shrink-0 border-l h-full p-2 pt-10 flex flex-col gap-2">
          {file.file_type === 'image' && canUpload && (
            <>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-full h-auto py-3 flex flex-col items-center gap-1"
                )}
                onClick={() => router.push(`/files/${file.id}/regenerate`)}
              >
                <Wand2 className="h-4 w-4" />
                <span className="text-[10px]">AI다시그리기</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-full h-auto py-3 flex flex-col items-center gap-1",
                  analyzingFiles.has(file.id) && 'relative overflow-hidden bg-gradient-to-r from-violet-500/20 via-purple-400/40 to-indigo-500/20 bg-[length:200%_100%] animate-shimmer'
                )}
                onClick={handleAnalyzeClick}
                disabled={analyzingFiles.has(file.id)}
              >
                <FileSearch className={`h-4 w-4 ${analyzingFiles.has(file.id) ? 'animate-pulse' : ''}`} />
                <span className="text-[10px]">수정사항분석</span>
              </Button>
            </>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full h-auto py-3 flex flex-col items-center gap-1 mt-auto"
              onClick={handleDeleteClick}
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-[10px]">삭제</span>
            </Button>
          )}
        </div>
      </div>

      {/* 이미지 뷰어 */}
      {file && (
        <ImageViewer
          imageUrl={imageUrl}
          imageName={file.file_name}
          open={imageViewerOpen}
          onOpenChange={setImageViewerOpen}
          onDownload={() => handleDownload({ stopPropagation: () => {} } as React.MouseEvent)}
        />
      )}
    </div>
  );
}
