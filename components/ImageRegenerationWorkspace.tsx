'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, Plus, Wand2, Download, RefreshCw, Search, CheckSquare2, Upload, Settings, ImageIcon } from 'lucide-react';
import { getReferenceFilesByWebtoon } from '@/lib/api/referenceFiles';
import { ReferenceFileWithProcess, Process, ReferenceFile, AiRegenerationPrompt, AiRegenerationStyle, FileWithRelations } from '@/lib/supabase';
import { ReferenceFileUpload } from './ReferenceFileUpload';
import { getProcesses } from '@/lib/api/processes';
import { getImageRegenerationSettings } from '@/lib/api/settings';
import { getPromptsByStyle, setPromptAsDefault } from '@/lib/api/imagePrompts';
import { getStyles } from '@/lib/api/aiStyles';
import { StyleManagementDialog } from './StyleManagementDialog';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface RegeneratedImage {
  id: string;
  url: string | null;
  prompt: string;
  originalPrompt?: string;
  selected: boolean;
  fileId: string | null;
  filePath: string | null;
  fileUrl: string | null;
  base64Data: string | null;
  mimeType: string | null;
  apiProvider: 'gemini' | 'seedream' | 'auto';
  index?: number;
  styleName?: string;
}

interface ReferenceImageInfo {
  id: string;
}

interface ImageRegenerationWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileWithRelations | null;
  webtoonId?: string;
  currentUserId?: string;
  regeneratedImages: RegeneratedImage[];
  selectedImageIds: Set<string>;
  regeneratingImage: string | null;
  savingImages: boolean;
  generationCount: number;
  onGenerationCountChange: (count: number) => void;
  onRegenerate: (stylePrompt: string, count?: number, useLatestImageAsInput?: boolean, referenceImage?: ReferenceImageInfo) => void;
  onRegenerateSingle: (prompt: string, apiProvider: 'gemini' | 'seedream' | 'auto', targetImageId?: string) => void;
  onImageSelect: (id: string, selected: boolean) => void;
  onSaveImages: (processId?: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImageViewerOpen: (imageUrl: string, imageName: string) => void;
  processes: Process[];
  canUpload: boolean;
}

export function ImageRegenerationWorkspace({
  open,
  onOpenChange,
  file,
  webtoonId,
  currentUserId,
  regeneratedImages,
  selectedImageIds,
  regeneratingImage,
  savingImages,
  generationCount,
  onGenerationCountChange,
  onRegenerate,
  onRegenerateSingle,
  onImageSelect,
  onSaveImages,
  onSelectAll,
  onDeselectAll,
  onImageViewerOpen,
  processes,
  canUpload,
}: ImageRegenerationWorkspaceProps) {
  // 스타일 관련 상태
  const [styles, setStyles] = useState<AiRegenerationStyle[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<AiRegenerationStyle | null>(null);
  const [styleManagementOpen, setStyleManagementOpen] = useState(false);
  const [styleSettings, setStyleSettings] = useState<Record<string, boolean>>({});

  // 프롬프트 관련 상태
  const [prompts, setPrompts] = useState<AiRegenerationPrompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>('');
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptEditOpen, setPromptEditOpen] = useState(false);

  // 레퍼런스 파일 관련 상태
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFileWithProcess[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [selectedReferenceFile, setSelectedReferenceFile] = useState<ReferenceFileWithProcess | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [allProcesses, setAllProcesses] = useState<Process[]>([]);

  // 공정 선택 다이얼로그 상태
  const [processSelectOpen, setProcessSelectOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');

  // API Provider에 따른 모델명 반환
  const getModelName = (apiProvider: 'gemini' | 'seedream' | 'auto'): string => {
    if (apiProvider === 'gemini') return 'gemini-3-pro';
    if (apiProvider === 'seedream') return 'seedream-4';
    return 'auto';
  };

  // 스타일 목록 로드
  const loadStyles = async () => {
    setLoadingStyles(true);
    try {
      const data = await getStyles();
      setStyles(data);
    } catch (error) {
      console.error('스타일 목록 로드 실패:', error);
    } finally {
      setLoadingStyles(false);
    }
  };

  // 다이얼로그 열릴 때 데이터 로드
  useEffect(() => {
    if (open) {
      loadStyles();
      // 공정 목록 로드
      getProcesses().then(setAllProcesses).catch(console.error);
      // 설정 로드
      getImageRegenerationSettings().then(settings => {
        const settingsMap: Record<string, boolean> = {};
        settings.forEach(setting => {
          settingsMap[setting.style_id] = setting.use_reference;
        });
        setStyleSettings(settingsMap);
      }).catch(console.error);
    }
  }, [open]);

  // 레퍼런스 파일 로드
  useEffect(() => {
    const loadReferenceFiles = async () => {
      const needsReference = selectedStyle?.requires_reference || styleSettings[selectedStyle?.style_key || ''];
      if (open && webtoonId && needsReference) {
        setLoadingReferences(true);
        try {
          const files = await getReferenceFilesByWebtoon(webtoonId);
          const imageFiles = files.filter(f => f.file_type === 'image');
          setReferenceFiles(imageFiles);
        } catch (error) {
          console.error('레퍼런스 파일 로드 실패:', error);
        } finally {
          setLoadingReferences(false);
        }
      }
    };
    loadReferenceFiles();
  }, [open, webtoonId, selectedStyle, styleSettings]);

  // 프롬프트 로드
  useEffect(() => {
    const loadPrompts = async () => {
      if (!selectedStyle || !currentUserId) return;

      setLoadingPrompts(true);
      try {
        const loadedPrompts = await getPromptsByStyle(selectedStyle.style_key, currentUserId);
        setPrompts(loadedPrompts);

        const defaultPrompt = loadedPrompts.find(p => p.is_default);
        if (defaultPrompt) {
          setSelectedPromptId(defaultPrompt.id);
          setEditedPrompt(defaultPrompt.prompt_text);
        } else {
          setSelectedPromptId(null);
          setEditedPrompt(selectedStyle.prompt);
        }
      } catch (error) {
        console.error('프롬프트 로드 실패:', error);
        setEditedPrompt(selectedStyle.prompt);
      } finally {
        setLoadingPrompts(false);
      }
    };

    if (open && selectedStyle) {
      loadPrompts();
    }
  }, [selectedStyle, open, currentUserId]);

  // 선택된 프롬프트 변경 시 편집 프롬프트 업데이트
  useEffect(() => {
    if (selectedPromptId) {
      const prompt = prompts.find(p => p.id === selectedPromptId);
      if (prompt) {
        setEditedPrompt(prompt.prompt_text);
      }
    }
  }, [selectedPromptId, prompts]);

  // 스타일 선택 핸들러
  const handleStyleSelect = (style: AiRegenerationStyle) => {
    setSelectedStyle(style);
    setSelectedReferenceFile(null);
    setEditedPrompt(style.prompt);
    setSelectedPromptId(null);
    setPromptEditOpen(false);
  };

  // 생성하기 핸들러
  const handleGenerate = async () => {
    if (!selectedStyle) return;

    // 프롬프트가 선택되어 있으면 기본으로 설정
    if (selectedPromptId && currentUserId) {
      try {
        await setPromptAsDefault(selectedPromptId, selectedStyle.style_key);
      } catch (error) {
        console.error('프롬프트 기본 설정 실패:', error);
      }
    }

    const referenceImage: ReferenceImageInfo | undefined = selectedReferenceFile
      ? { id: selectedReferenceFile.id }
      : undefined;

    const count = selectedStyle.allow_multiple ? generationCount : selectedStyle.default_count;

    onRegenerate(editedPrompt.trim() || selectedStyle.prompt, count, false, referenceImage);
  };

  // 레퍼런스 업로드 완료 핸들러
  const handleReferenceUploadComplete = async (uploadedFile?: ReferenceFile) => {
    if (webtoonId) {
      try {
        const files = await getReferenceFilesByWebtoon(webtoonId);
        const imageFiles = files.filter(f => f.file_type === 'image');
        setReferenceFiles(imageFiles);
        if (uploadedFile && uploadedFile.file_type === 'image') {
          const foundFile = imageFiles.find(f => f.id === uploadedFile.id);
          if (foundFile) setSelectedReferenceFile(foundFile);
          else if (imageFiles.length > 0) setSelectedReferenceFile(imageFiles[0]);
        } else if (imageFiles.length > 0) {
          setSelectedReferenceFile(imageFiles[0]);
        }
      } catch (error) {
        console.error('레퍼런스 파일 로드 실패:', error);
      }
    }
  };

  // 다음 공정 찾기
  const getNextProcessId = (currentProcessId: string): string => {
    const sortedProcesses = [...processes].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sortedProcesses.findIndex(p => p.id === currentProcessId);
    if (currentIndex >= 0 && currentIndex < sortedProcesses.length - 1) {
      return sortedProcesses[currentIndex + 1].id;
    }
    return currentProcessId;
  };

  // 공정 선택 다이얼로그 열기
  const handleOpenProcessSelect = () => {
    if (file) {
      setSelectedProcessId(getNextProcessId(file.process_id));
    }
    setProcessSelectOpen(true);
  };

  // 이미지 저장
  const handleSaveWithProcess = async () => {
    if (selectedProcessId) {
      await onSaveImages(selectedProcessId);
      setProcessSelectOpen(false);
    }
  };

  // 스타일을 그룹별로 분류
  const groupedStyles = styles.reduce((acc, style) => {
    const groupKey = style.group_name || '기타';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(style);
    return acc;
  }, {} as Record<string, AiRegenerationStyle[]>);

  const sortedGroups = Object.keys(groupedStyles).sort((a, b) => {
    if (a === '기타') return 1;
    if (b === '기타') return -1;
    return a.localeCompare(b);
  });

  // 원본 이미지 URL
  const imageUrl = file?.file_path?.startsWith('http')
    ? file.file_path
    : file?.file_path?.startsWith('/')
      ? file.file_path
      : file?.file_path ? `https://${file.file_path}` : '';

  // 레퍼런스 필요 여부
  const needsReference = selectedStyle?.requires_reference || styleSettings[selectedStyle?.style_key || ''];

  if (!file) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] !top-[2.5vh] !left-[2.5vw] !translate-x-0 !translate-y-0 p-0 overflow-hidden">
          <div className="flex h-[95vh]">
            {/* 왼쪽 패널 (30%) - 설정 */}
            <div className="w-[30%] border-r h-[95vh] overflow-y-auto">
              <div className="sticky top-0 z-10 bg-background px-4 py-3 border-b">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-base">AI 다시그리기</DialogTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setStyleManagementOpen(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-3 space-y-3">
                  {/* 원본 이미지 카드 */}
                  <Card>
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5" />
                        원본 이미지
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <div
                        className="relative w-full aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group"
                        onClick={() => onImageViewerOpen(imageUrl, file.file_name)}
                      >
                        <Image
                          src={imageUrl}
                          alt={file.file_name}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, 30vw"
                          unoptimized={true}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                            <Search className="h-4 w-4 text-white" />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1.5">{file.file_name}</p>
                    </CardContent>
                  </Card>

                  {/* 스타일 선택 카드 */}
                  <Card>
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                        <Wand2 className="h-3.5 w-3.5" />
                        스타일 선택
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      {loadingStyles ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {sortedGroups.map((groupName) => (
                            <div key={groupName} className="space-y-1">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{groupName}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {groupedStyles[groupName].map((style) => (
                                  <Button
                                    key={style.id}
                                    variant={selectedStyle?.id === style.id ? "default" : "outline"}
                                    size="sm"
                                    className="h-7 text-xs px-2"
                                    onClick={() => handleStyleSelect(style)}
                                    disabled={regeneratingImage !== null}
                                  >
                                    {style.name}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* 선택된 스타일 설정 */}
                  {selectedStyle && (
                    <>
                      {/* 참조 이미지 카드 */}
                      {needsReference && (
                        <Card>
                          <CardHeader className="py-2 px-3">
                            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                              <ImageIcon className="h-3.5 w-3.5" />
                              참조 이미지
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-3 pb-3 pt-0">
                            {loadingReferences ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : (
                              <div className="grid grid-cols-4 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setUploadDialogOpen(true)}
                                  disabled={regeneratingImage !== null}
                                  className="aspect-square bg-muted border border-dashed border-muted-foreground/25 rounded hover:border-primary/50 hover:bg-muted/80 transition-colors flex items-center justify-center disabled:opacity-50"
                                >
                                  <Plus className="h-4 w-4 text-muted-foreground" />
                                </button>
                                {referenceFiles.map((refFile) => (
                                  <div
                                    key={refFile.id}
                                    className={cn(
                                      "cursor-pointer transition-all overflow-hidden rounded aspect-square relative",
                                      selectedReferenceFile?.id === refFile.id
                                        ? "ring-2 ring-primary"
                                        : "hover:ring-1 hover:ring-primary/50"
                                    )}
                                    onClick={() => setSelectedReferenceFile(refFile)}
                                  >
                                    <img
                                      src={refFile.thumbnail_path
                                        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${refFile.thumbnail_path}`
                                        : refFile.file_path}
                                      alt={refFile.file_name}
                                      className="w-full h-full object-cover"
                                    />
                                    {selectedReferenceFile?.id === refFile.id && (
                                      <div className="absolute top-0.5 right-0.5">
                                        <div className="bg-primary rounded-full p-0.5">
                                          <Check className="h-2 w-2 text-primary-foreground" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* 생성 설정 카드 */}
                      <Card>
                        <CardHeader className="py-2 px-3">
                          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                            생성 설정
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0 space-y-3">
                          {/* 생성 장수 */}
                          {selectedStyle.allow_multiple && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">생성 장수</label>
                              <Select value={generationCount.toString()} onValueChange={(value) => onGenerationCountChange(parseInt(value))}>
                                <SelectTrigger className="w-20 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 10 }, (_, i) => (i + 1) * 2).map((count) => (
                                    <SelectItem key={count} value={count.toString()}>
                                      {count}장
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* 프롬프트 편집 토글 */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPromptEditOpen(!promptEditOpen)}
                            className="w-full h-7 text-xs"
                          >
                            {promptEditOpen ? '프롬프트 숨기기' : '프롬프트 수정'}
                          </Button>

                          {/* 프롬프트 선택 및 편집 */}
                          {promptEditOpen && (
                            <div className="space-y-2">
                              {loadingPrompts ? (
                                <div className="flex items-center justify-center py-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                              ) : (
                                <Select
                                  value={selectedPromptId || 'custom'}
                                  onValueChange={(value) => {
                                    if (value === 'custom') {
                                      setSelectedPromptId(null);
                                      if (selectedStyle) setEditedPrompt(selectedStyle.prompt);
                                    } else {
                                      setSelectedPromptId(value);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-full h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="custom">직접 입력</SelectItem>
                                    {prompts.map((prompt) => (
                                      <SelectItem key={prompt.id} value={prompt.id}>
                                        {prompt.prompt_name} {prompt.is_default ? '(기본)' : prompt.is_shared ? '(공유)' : '(개인)'}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <textarea
                                value={editedPrompt}
                                onChange={(e) => setEditedPrompt(e.target.value)}
                                className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                placeholder="프롬프트를 입력하세요..."
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* 생성 버튼 */}
                      <Button
                        onClick={handleGenerate}
                        disabled={regeneratingImage !== null || (needsReference && !selectedReferenceFile)}
                        className={cn(
                          "w-full",
                          regeneratingImage !== null && "bg-gradient-to-r from-primary/80 via-primary to-primary/80 bg-[length:200%_100%] animate-shimmer"
                        )}
                      >
                        {regeneratingImage !== null ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            생성 중...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            생성하기
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
            </div>

            {/* 오른쪽 패널 (70%) - 결과 */}
            <div className="w-[70%] flex flex-col h-[95vh] bg-muted/30">
              {/* 결과 헤더 */}
              <div className="px-4 py-3 border-b bg-background flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">생성 결과</h3>
                  {regeneratedImages.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {regeneratedImages.length}장
                    </Badge>
                  )}
                </div>
                {canUpload && regeneratedImages.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedImageIds.size === regeneratedImages.length) {
                          onDeselectAll();
                        } else {
                          onSelectAll();
                        }
                      }}
                      className="h-7 text-xs"
                    >
                      <CheckSquare2 className="h-3 w-3 mr-1" />
                      {selectedImageIds.size === regeneratedImages.length ? '전체 해제' : '전체 선택'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleOpenProcessSelect}
                      disabled={selectedImageIds.size === 0 || savingImages}
                      className="h-7 text-xs"
                    >
                      <Upload className={cn("h-3 w-3 mr-1", savingImages && "animate-pulse")} />
                      {savingImages ? '등록 중...' : `선택한 이미지 등록 (${selectedImageIds.size})`}
                    </Button>
                  </div>
                )}
              </div>

              {/* 결과 그리드 */}
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {regeneratedImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                      <Wand2 className="h-12 w-12 mb-4 opacity-20" />
                      <p className="text-sm">스타일을 선택하고 생성하기를 클릭하세요</p>
                      <p className="text-xs mt-1">생성된 이미지가 여기에 표시됩니다</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {regeneratedImages.map((img) => {
                        const isPlaceholder = img.url === null;

                        return (
                          <div key={img.id} className="relative space-y-1.5">
                            <div
                              className={cn(
                                "relative w-full aspect-square bg-muted rounded-md overflow-hidden",
                                isPlaceholder
                                  ? "bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer cursor-wait"
                                  : "group cursor-pointer"
                              )}
                              onClick={() => {
                                if (!isPlaceholder && img.url) {
                                  onImageViewerOpen(img.url, `재생성된 이미지 - ${file.file_name}`);
                                }
                              }}
                            >
                              {!isPlaceholder && (
                                <>
                                  <input
                                    type="checkbox"
                                    checked={selectedImageIds.has(img.id)}
                                    onChange={(e) => onImageSelect(img.id, e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute top-2 left-2 z-10 w-4 h-4 cursor-pointer"
                                  />
                                  <div className="absolute top-2 right-2 z-10 flex gap-1">
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!img.url) return;
                                        const a = document.createElement('a');
                                        a.href = img.url;
                                        a.download = `regenerated-${file.file_name}`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                      }}
                                      title="다운로드"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className={cn(
                                        "h-6 w-6",
                                        regeneratingImage === img.id && "bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRegenerateSingle(img.prompt, img.apiProvider, img.id);
                                      }}
                                      disabled={regeneratingImage === img.id}
                                      title="다시 생성"
                                    >
                                      <RefreshCw className={cn("h-3 w-3", regeneratingImage === img.id && "animate-spin")} />
                                    </Button>
                                  </div>
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                                      <Search className="h-4 w-4 text-white" />
                                    </div>
                                  </div>
                                </>
                              )}
                              {isPlaceholder ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Wand2 className="h-6 w-6 text-primary/50 animate-pulse" />
                                </div>
                              ) : img.url ? (
                                <Image
                                  src={img.url}
                                  alt="재생성된 이미지"
                                  fill
                                  className="object-contain"
                                  sizes="(max-width: 768px) 50vw, 25vw"
                                  unoptimized={true}
                                />
                              ) : null}
                            </div>
                            {!isPlaceholder && (
                              <div className="flex items-center justify-center">
                                <Badge variant="secondary" className="text-[10px]">
                                  {getModelName(img.apiProvider)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 공정 선택 다이얼로그 */}
      <Dialog open={processSelectOpen} onOpenChange={setProcessSelectOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>등록할 공정 선택</DialogTitle>
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
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProcessSelectOpen(false)} disabled={savingImages}>
              취소
            </Button>
            <Button onClick={handleSaveWithProcess} disabled={!selectedProcessId || savingImages}>
              {savingImages ? '등록 중...' : '등록'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 레퍼런스 파일 업로드 다이얼로그 */}
      {webtoonId && (
        <ReferenceFileUpload
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          webtoonId={webtoonId}
          processes={allProcesses}
          onUploadComplete={handleReferenceUploadComplete}
        />
      )}

      {/* 스타일 관리 다이얼로그 */}
      <StyleManagementDialog
        open={styleManagementOpen}
        onOpenChange={setStyleManagementOpen}
        onStylesChange={loadStyles}
      />
    </>
  );
}

