'use client';

import { useState, useEffect } from 'react';
import { File as FileType, Process, FileWithRelations, UserProfile } from '@/lib/supabase';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileIcon, Download, Trash2, Sparkles, Wand2, Search, HardDrive, Calendar, Upload, CheckSquare2, RefreshCw, User, Link2, Save, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { savePrompt } from '@/lib/api/imagePrompts';
import { styleOptions } from '@/lib/constants/imageRegeneration';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface RegeneratedImage {
  id: string;
  url: string | null; // null이면 placeholder (생성 중)
  prompt: string; // 실제 사용된 프롬프트 (변형된 프롬프트 포함)
  originalPrompt?: string; // 원본 프롬프트 (사용자가 선택하거나 입력한 프롬프트)
  selected: boolean;
  base64Data: string | null; // null이면 placeholder
  mimeType: string | null; // null이면 placeholder
  apiProvider: 'gemini' | 'seedream' | 'auto';
}

interface FileDetailDialogProps {
  file: FileWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageViewerOpen: (imageUrl: string, imageName: string) => void;
  onDownload: (file: FileType, e: React.MouseEvent) => void;
  onAnalyze?: (file: FileType, e: React.MouseEvent) => void;
  onDelete: (file: FileType, e: React.MouseEvent) => void;
  onRegenerateClick: () => void;
  onRegenerateSingle: (prompt: string, apiProvider: 'gemini' | 'seedream' | 'auto', targetImageId?: string) => void;
  onImageSelect: (id: string, selected: boolean) => void;
  onSaveImages: (processId?: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  imageErrors: Set<string>;
  imageDimensions: { width: number; height: number } | null;
  regeneratedImages: RegeneratedImage[];
  selectedImageIds: Set<string>;
  regeneratingImage: string | null;
  savingImages: boolean;
  analyzingFiles: Set<string>;
  canUpload: boolean;
  canDelete: boolean;
  processes: Process[]; // 공정 목록
  onSourceFileClick?: (file: FileType) => void; // 원본 파일 클릭 시 콜백
  onSaveComplete?: (processId: string) => void; // 저장 완료 시 콜백 (공정 선택 + 다이얼로그 닫기)
  currentUserId?: string; // 현재 사용자 ID
}

export function FileDetailDialog({
  file,
  open,
  onOpenChange,
  onImageViewerOpen,
  onDownload,
  onAnalyze,
  onDelete,
  onRegenerateClick,
  onRegenerateSingle,
  onImageSelect,
  onSaveImages,
  onSelectAll,
  onDeselectAll,
  imageErrors,
  imageDimensions,
  regeneratedImages,
  selectedImageIds,
  regeneratingImage,
  savingImages,
  analyzingFiles,
  canUpload,
  canDelete,
  processes,
  onSourceFileClick,
  onSaveComplete,
  currentUserId,
}: FileDetailDialogProps) {
  const [processSelectOpen, setProcessSelectOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');
  const [savePromptDialogOpen, setSavePromptDialogOpen] = useState(false);
  const [promptToSave, setPromptToSave] = useState<{ prompt: string; styleId: string } | null>(null);
  const [promptName, setPromptName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // 다음 공정 찾기 (order_index 기준)
  const getNextProcessId = (currentProcessId: string): string => {
    const sortedProcesses = [...processes].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sortedProcesses.findIndex(p => p.id === currentProcessId);
    if (currentIndex >= 0 && currentIndex < sortedProcesses.length - 1) {
      return sortedProcesses[currentIndex + 1].id;
    }
    return currentProcessId; // 다음 공정이 없으면 현재 공정 유지
  };

  // 다이얼로그가 열릴 때 다음 공정으로 초기화
  const handleOpenProcessSelect = () => {
    if (file) {
      setSelectedProcessId(getNextProcessId(file.process_id));
    }
    setProcessSelectOpen(true);
  };

  // 프롬프트가 수정되었는지 확인
  const isPromptModified = (img: RegeneratedImage): boolean => {
    // originalPrompt가 없으면 이전 버전 호환성을 위해 기본 프롬프트와 비교
    if (!img.originalPrompt) {
      const style = styleOptions.find(s => img.prompt.includes(s.prompt) || s.prompt === img.prompt);
      if (!style) {
        return true;
      }
      return img.prompt.trim() !== style.prompt.trim();
    }
    // originalPrompt와 prompt를 비교하여 수정 여부 확인
    // prompt는 변형된 프롬프트일 수 있으므로, originalPrompt와 비교
    // 하지만 실제로는 originalPrompt가 사용자가 선택한 프롬프트이므로,
    // originalPrompt와 prompt가 다르면 변형된 것이고, 이는 수정된 것으로 간주하지 않음
    // 대신, originalPrompt가 기본 프롬프트와 다른지 확인해야 함
    
    // originalPrompt에서 사용된 스타일 찾기
    const style = styleOptions.find(s => img.originalPrompt!.includes(s.prompt) || s.prompt === img.originalPrompt);
    if (!style) {
      // 스타일을 찾지 못한 경우 수정된 것으로 간주
      return true;
    }
    // originalPrompt가 기본 프롬프트와 정확히 일치하는지 확인
    return img.originalPrompt.trim() !== style.prompt.trim();
  };

  // 프롬프트 저장 다이얼로그 열기
  const handleOpenSavePrompt = (img: RegeneratedImage) => {
    // 프롬프트에서 사용된 스타일 찾기
    const style = styleOptions.find(s => img.prompt.includes(s.prompt) || s.prompt === img.prompt);
    if (style) {
      setPromptToSave({ prompt: img.prompt, styleId: style.id });
      setPromptName('');
      setIsShared(false);
      setSavePromptDialogOpen(true);
    } else {
      // 스타일을 찾지 못한 경우 사용자에게 스타일 선택 요청
      alert('이 프롬프트의 스타일을 확인할 수 없습니다. 스타일을 선택해주세요.');
    }
  };

  // 프롬프트 저장
  const handleSavePrompt = async () => {
    if (!promptToSave || !currentUserId || !promptName.trim()) {
      alert('프롬프트 이름을 입력해주세요.');
      return;
    }

    setSavingPrompt(true);
    try {
      // "이 프롬프트 저장"으로 저장할 때는 기본 프롬프트로 설정
      await savePrompt(promptToSave.styleId, promptToSave.prompt, promptName.trim(), isShared, currentUserId, true);
      alert('프롬프트가 기본 프롬프트로 저장되었습니다.');
      setSavePromptDialogOpen(false);
      setPromptToSave(null);
      setPromptName('');
      setIsShared(false);
    } catch (error) {
      console.error('프롬프트 저장 실패:', error);
      alert('프롬프트 저장에 실패했습니다.');
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveWithProcess = async () => {
    if (selectedProcessId) {
      onSaveImages(selectedProcessId);
      setProcessSelectOpen(false);
      // 저장 완료 후 다이얼로그 닫고 해당 공정 선택
      if (onSaveComplete) {
        onSaveComplete(selectedProcessId);
      }
    }
  };

  if (!file) return null;

  const metadata = file.metadata as {
    scene_summary?: string;
    tags?: string[];
    characters_count?: number;
    analyzed_at?: string;
  } | undefined;

  const hasMetadata = metadata && metadata.scene_summary && metadata.tags;

  const imageUrl = file.file_path?.startsWith('http')
    ? file.file_path
    : file.file_path?.startsWith('/')
      ? file.file_path
      : `https://${file.file_path}`;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] !top-[2.5vh] !left-[2.5vw] !translate-x-0 !translate-y-0 !sm:max-w-[95vw] overflow-y-auto p-6">
        <DialogTitle asChild>
          <h2 className="text-xl font-semibold break-words mb-0">{file.file_name}</h2>
        </DialogTitle>
        <div className="space-y-6">
          {/* 파일 미리보기 */}
          <div className="w-full">
            {file.file_type === 'image' && !imageErrors.has(file.id) ? (
              <div 
                className="relative w-full h-[60vh] min-h-[400px] bg-muted rounded-md overflow-hidden group cursor-pointer" 
                onClick={() => onImageViewerOpen(imageUrl, file.file_name)}
              >
                <Image 
                  src={imageUrl} 
                  alt={file.file_name} 
                  fill 
                  className="object-contain" 
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                  unoptimized={true}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-3">
                    <Search className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-[60vh] min-h-[400px] bg-muted rounded-md flex items-center justify-center">
                <div className="text-center">
                  <FileIcon className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                  {file.file_type === 'image' && (
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
                  <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{file.file_name}</span>
                </div>
                {file.file_size && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      파일 크기
                    </span>
                    <span className="text-sm font-medium text-right flex-1 ml-4">
                      {(file.file_size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                )}
                {file.mime_type && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-muted-foreground">MIME 타입</span>
                    <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{file.mime_type}</span>
                  </div>
                )}
                {file.file_type === 'image' && imageDimensions && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-muted-foreground">이미지 사이즈</span>
                    <span className="text-sm font-medium text-right flex-1 ml-4">
                      {imageDimensions.width} × {imageDimensions.height} px
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    생성일
                  </span>
                  <span className="text-sm font-medium text-right flex-1 ml-4">
                    {format(new Date(file.created_at), 'yyyy년 MM월 dd일 HH:mm')}
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    생성자
                  </span>
                  <span className="text-sm font-medium text-right flex-1 ml-4">
                    {file.created_by_user 
                      ? `${file.created_by_user.name || '이름 없음'} (${file.created_by_user.email})`
                      : '알 수 없음'}
                  </span>
                </div>
                {file.source_file && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      원본 파일
                    </p>
                    <div 
                      className="flex items-center gap-3 p-2 bg-muted rounded-md cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => onSourceFileClick?.(file.source_file!)}
                    >
                      {file.source_file.file_type === 'image' ? (
                        <div className="relative w-12 h-12 bg-background rounded overflow-hidden flex-shrink-0">
                          <Image
                            src={(() => {
                              // 썸네일이 있으면 썸네일 사용, 없으면 원본 사용
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
                            sizes="48px"
                            unoptimized={true}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-background rounded flex items-center justify-center flex-shrink-0">
                          <FileIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.source_file.file_name}</p>
                        <p className="text-xs text-muted-foreground">클릭하여 원본 파일 보기</p>
                      </div>
                    </div>
                  </div>
                )}
                {file.description && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">설명</p>
                    <p className="text-sm">{file.description}</p>
                  </div>
                )}
                {file.prompt && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Wand2 className="h-3 w-3" />
                      생성 프롬프트
                    </p>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap break-words">{file.prompt}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 메타데이터 카드 */}
            {file.file_type === 'image' && (
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">메타데이터</CardTitle>
                </CardHeader>
                <CardContent>
                  {hasMetadata ? (
                    <div className="space-y-3">
                      {metadata?.scene_summary && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">장면 요약</p>
                          <p className="text-sm">{metadata.scene_summary}</p>
                        </div>
                      )}
                      {metadata?.tags && metadata.tags.length > 0 && (
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
                      {typeof metadata?.characters_count === 'number' && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">등장 인물 수</p>
                          <p className="text-sm">{metadata.characters_count}명</p>
                        </div>
                      )}
                      {metadata?.analyzed_at && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">분석 일시</p>
                          <p className="text-sm">
                            {format(new Date(metadata.analyzed_at), 'yyyy년 MM월 dd일 HH:mm')}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                      <span>메타데이터가 없습니다. 분석 버튼을 눌러 생성하세요.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 재생성된 이미지 표시 */}
          {regeneratedImages.length > 0 && (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">재생성된 이미지 ({regeneratedImages.length}장)</h3>
                <div className="flex gap-2">
                  {canUpload && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedImageIds.size === regeneratedImages.length) {
                            onDeselectAll();
                          } else {
                            onSelectAll();
                          }
                        }}
                        title={selectedImageIds.size === regeneratedImages.length ? '전체 선택 해제' : '전체 선택'}
                      >
                        <CheckSquare2 className="h-3 w-3 mr-1" />
                        {selectedImageIds.size === regeneratedImages.length ? '전체 해제' : '전체 선택'}
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenProcessSelect();
                        }}
                        disabled={selectedImageIds.size === 0 || savingImages}
                      >
                        <Upload className={cn("h-3 w-3 mr-1", savingImages && "animate-pulse")} />
                        {savingImages ? '등록 중...' : `선택한 이미지 등록 (${selectedImageIds.size})`}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regeneratedImages.map((img) => {
                  // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
                  const isPlaceholder = img.url === null;
                  
                  return (
                    <div key={img.id} className="relative space-y-2">
                      <div 
                        className={cn(
                          "relative w-full aspect-square bg-muted rounded-md overflow-hidden",
                          isPlaceholder 
                            ? "overflow-hidden bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer cursor-wait"
                            : "group cursor-pointer"
                        )}
                        onClick={() => {
                          if (!isPlaceholder && img.url) {
                            onImageViewerOpen(img.url, `재생성된 이미지 - ${file.file_name || '이미지'}`);
                          }
                        }}
                      >
                        {!isPlaceholder && (
                          <>
                            <input
                              type="checkbox"
                              checked={selectedImageIds.has(img.id)}
                              onChange={(e) => {
                                onImageSelect(img.id, e.target.checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-2 left-2 z-10 w-5 h-5 cursor-pointer"
                            />
                            <div className="absolute top-2 right-2 z-10 flex gap-1">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!img.url) return;
                                  try {
                                    const a = document.createElement('a');
                                    a.href = img.url;
                                    a.download = `regenerated-${file.file_name || 'image'}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                  } catch (error) {
                                    console.error('재생성된 이미지 다운로드 실패:', error);
                                    alert('이미지 다운로드에 실패했습니다.');
                                  }
                                }}
                                title="다운로드"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="secondary"
                                className={cn(
                                  "h-8 w-8",
                                  regeneratingImage === img.id && 'overflow-hidden bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer'
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRegenerateSingle(img.prompt, img.apiProvider, img.id);
                                }}
                                disabled={regeneratingImage === img.id}
                                title="다시 생성"
                              >
                                <RefreshCw className={cn(
                                  "h-4 w-4",
                                  regeneratingImage === img.id && 'animate-spin'
                                )} />
                              </Button>
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                                <Search className="h-5 w-5 text-white" />
                              </div>
                            </div>
                          </>
                        )}
                        {isPlaceholder ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Wand2 className="h-8 w-8 text-primary/50 animate-pulse" />
                          </div>
                        ) : img.url ? (
                          <Image
                            src={img.url}
                            alt="재생성된 이미지"
                            fill
                            className="object-contain"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            unoptimized={true}
                            onError={(e) => {
                              console.error('[이미지 로드 실패]', {
                                url: img.url,
                                fileId: img.fileId,
                                filePath: img.filePath,
                                fileUrl: img.fileUrl,
                              });
                            }}
                          />
                        ) : null}
                      </div>
                      {!isPlaceholder && currentUserId && img.prompt && isPromptModified(img) && (
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSavePrompt(img);
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            이 프롬프트 저장
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-2 pt-4 border-t flex-wrap">
            <Button
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onDownload(file, e);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              다운로드
            </Button>
            {file.file_type === 'image' && canUpload && onAnalyze && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenChange(false);
                    onAnalyze(file, e);
                  }}
                  disabled={analyzingFiles.has(file.id)}
                >
                  <Sparkles className={`h-4 w-4 mr-2 ${analyzingFiles.has(file.id) ? 'animate-pulse' : ''}`} />
                  {analyzingFiles.has(file.id) ? '분석 중...' : '분석'}
                </Button>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1",
                    regeneratingImage === file.id && 'relative overflow-hidden bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerateClick();
                  }}
                  disabled={regeneratingImage === file.id}
                >
                  <Wand2 className={`h-4 w-4 mr-2 ${regeneratingImage === file.id ? 'animate-pulse' : ''}`} />
                  {regeneratingImage === file.id ? '재생성 중...' : 'AI 다시그리기'}
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                  onDelete(file, e);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                삭제
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* 공정 선택 다이얼로그 */}
    <Dialog open={processSelectOpen} onOpenChange={setProcessSelectOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>등록할 공정 선택</DialogTitle>
          <DialogDescription>
            재생성된 이미지를 등록할 공정을 선택하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="공정을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {processes.map((process) => (
                <SelectItem key={process.id} value={process.id}>
                  {process.name}
                  {process.id === file?.process_id && ' (원본 공정)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setProcessSelectOpen(false);
          }} disabled={savingImages}>
            취소
          </Button>
          <Button onClick={handleSaveWithProcess} disabled={!selectedProcessId || savingImages}>
            {savingImages ? '등록 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 프롬프트 저장 다이얼로그 */}
    <Dialog open={savePromptDialogOpen} onOpenChange={setSavePromptDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>프롬프트 저장</DialogTitle>
          <DialogDescription>
            이 프롬프트를 저장하여 나중에 재사용할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="save-prompt-name" className="text-sm font-medium">프롬프트 이름</label>
            <Input
              id="save-prompt-name"
              value={promptName}
              onChange={(e) => setPromptName(e.target.value)}
              placeholder="프롬프트 이름을 입력하세요"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">프롬프트 내용</label>
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm whitespace-pre-wrap break-words">{promptToSave?.prompt}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="save-prompt-shared"
              checked={isShared}
              onCheckedChange={(checked) => setIsShared(checked === true)}
            />
            <label htmlFor="save-prompt-shared" className="text-sm cursor-pointer">
              다른 사용자와 공유
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSavePromptDialogOpen(false)} disabled={savingPrompt}>
            취소
          </Button>
          <Button onClick={handleSavePrompt} disabled={!promptName.trim() || savingPrompt}>
            {savingPrompt ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

