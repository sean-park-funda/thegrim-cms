'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Check, Plus, Settings } from 'lucide-react';
import { getReferenceFilesByWebtoon } from '@/lib/api/referenceFiles';
import { ReferenceFileWithProcess, Process, ReferenceFile, AiRegenerationPrompt, AiRegenerationStyle } from '@/lib/supabase';
import { ReferenceFileUpload } from './ReferenceFileUpload';
import { getProcesses } from '@/lib/api/processes';
import { getImageRegenerationSettings } from '@/lib/api/settings';
import { getPromptsByStyle, setPromptAsDefault } from '@/lib/api/imagePrompts';
import { getStyles, getStyleByKey } from '@/lib/api/aiStyles';
import { StyleManagementDialog } from './StyleManagementDialog';

interface RegeneratedImage {
  id: string;
  url: string | null; // null이면 placeholder (생성 중)
  prompt: string; // 실제 사용된 프롬프트 (변형된 프롬프트 포함)
  originalPrompt?: string; // 원본 프롬프트 (사용자가 선택하거나 입력한 프롬프트)
  selected: boolean;
  base64Data: string | null; // null이면 placeholder
  mimeType: string | null; // null이면 placeholder
}

interface ReferenceImageInfo {
  id: string; // 레퍼런스 파일 ID
}

interface ImageRegenerationDialogProps {
  styleSelectionOpen: boolean;
  onStyleSelectionChange: (open: boolean) => void;
  onRegenerate: (stylePrompt: string, count?: number, useLatestImageAsInput?: boolean, referenceImage?: ReferenceImageInfo) => void;
  regeneratedImages: RegeneratedImage[];
  selectedImageIds: Set<string>;
  onImageSelect: (id: string, selected: boolean) => void;
  onSaveImages: () => void;
  regeneratingImage: string | null;
  generationCount: number;
  onGenerationCountChange: (count: number) => void;
  fileToViewId: string | null;
  webtoonId?: string; // 레퍼런스 파일 조회용
  currentUserId?: string; // 현재 사용자 ID
}

export function ImageRegenerationDialog({
  styleSelectionOpen,
  onStyleSelectionChange,
  onRegenerate,
  regeneratedImages,
  selectedImageIds,
  onImageSelect,
  onSaveImages,
  regeneratingImage,
  generationCount,
  onGenerationCountChange,
  fileToViewId,
  webtoonId,
  currentUserId,
}: ImageRegenerationDialogProps) {
  const [countSelectionOpen, setCountSelectionOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<AiRegenerationStyle | null>(null);
  const [mangaShadingConfirmOpen, setMangaShadingConfirmOpen] = useState(false);
  const [pendingMangaShadingStyle, setPendingMangaShadingStyle] = useState<AiRegenerationStyle | null>(null);

  // DB 기반 스타일 목록
  const [styles, setStyles] = useState<AiRegenerationStyle[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [styleManagementOpen, setStyleManagementOpen] = useState(false);

  // 프롬프트 관련 상태
  const [prompts, setPrompts] = useState<AiRegenerationPrompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>('');
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptEditOpen, setPromptEditOpen] = useState(false);

  // 레퍼런스 파일 선택 관련 상태
  const [referenceSelectionOpen, setReferenceSelectionOpen] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFileWithProcess[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [selectedReferenceFile, setSelectedReferenceFile] = useState<ReferenceFileWithProcess | null>(null);
  const [pendingReferenceStyle, setPendingReferenceStyle] = useState<AiRegenerationStyle | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [styleSettings, setStyleSettings] = useState<Record<string, boolean>>({});

  // DB에서 스타일 목록 로드
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

  // 스타일 선택 다이얼로그 열릴 때 스타일 로드
  useEffect(() => {
    if (styleSelectionOpen) {
      loadStyles();
    }
  }, [styleSelectionOpen]);

  // 공정 목록 로드
  useEffect(() => {
    const loadProcesses = async () => {
      try {
        const processesData = await getProcesses();
        setProcesses(processesData);
      } catch (error) {
        console.error('공정 목록 로드 실패:', error);
      }
    };
    loadProcesses();
  }, []);

  // 이미지 재생성 설정 로드
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getImageRegenerationSettings();
        const settingsMap: Record<string, boolean> = {};
        settings.forEach(setting => {
          settingsMap[setting.style_id] = setting.use_reference;
        });
        setStyleSettings(settingsMap);
      } catch (error) {
        console.error('설정 로드 실패:', error);
      }
    };
    loadSettings();
  }, []);

  // 레퍼런스 파일 로드
  useEffect(() => {
    const loadReferenceFiles = async () => {
      if (referenceSelectionOpen && webtoonId) {
        setLoadingReferences(true);
        try {
          const files = await getReferenceFilesByWebtoon(webtoonId);
          // 이미지 파일만 필터링
          const imageFiles = files.filter(f => f.file_type === 'image');
          setReferenceFiles(imageFiles);
        } catch (error) {
          console.error('레퍼런스 파일 로드 실패:', error);
          alert('레퍼런스 파일을 불러오는데 실패했습니다.');
        } finally {
          setLoadingReferences(false);
        }
      }
    };
    loadReferenceFiles();
  }, [referenceSelectionOpen, webtoonId]);

  // 프롬프트 로드 (스타일 선택 시)
  useEffect(() => {
    const loadPrompts = async () => {
      const style = selectedStyle || pendingReferenceStyle;
      if (!style || !currentUserId) return;

      setLoadingPrompts(true);
      try {
        // style_key를 사용하여 프롬프트 조회
        const loadedPrompts = await getPromptsByStyle(style.style_key, currentUserId);
        setPrompts(loadedPrompts);

        // 기본 프롬프트 선택
        const defaultPrompt = loadedPrompts.find(p => p.is_default);
        if (defaultPrompt) {
          setSelectedPromptId(defaultPrompt.id);
          setEditedPrompt(defaultPrompt.prompt_text);
        } else {
          // 기본 프롬프트가 없으면 스타일의 기본 프롬프트 사용
          setSelectedPromptId(null);
          setEditedPrompt(style.prompt);
        }
      } catch (error) {
        console.error('프롬프트 로드 실패:', error);
        // 에러 발생 시 스타일의 기본 프롬프트 사용
        if (style) {
          setEditedPrompt(style.prompt);
        }
      } finally {
        setLoadingPrompts(false);
      }
    };

    if (countSelectionOpen || referenceSelectionOpen) {
      loadPrompts();
    }
  }, [selectedStyle, pendingReferenceStyle, countSelectionOpen, referenceSelectionOpen, currentUserId]);

  // 선택된 프롬프트 변경 시 편집 프롬프트 업데이트
  useEffect(() => {
    if (selectedPromptId) {
      const prompt = prompts.find(p => p.id === selectedPromptId);
      if (prompt) {
        setEditedPrompt(prompt.prompt_text);
      }
    }
  }, [selectedPromptId, prompts]);

  const handleStyleClick = (style: AiRegenerationStyle) => {
    // 설정에서 레퍼런스 사용 여부 확인
    const useReference = styleSettings[style.style_key] ?? style.requires_reference ?? false;

    // 레퍼런스 사용이 설정되어 있고 웹툰이 선택되어 있으면 레퍼런스 선택 다이얼로그 표시
    if (useReference && webtoonId) {
      setPendingReferenceStyle(style);
      setSelectedReferenceFile(null);
      setReferenceSelectionOpen(true);
      onStyleSelectionChange(false);
      return;
    }

    // 레퍼런스 사용하지 않거나 웹툰이 없으면 기존 로직대로 진행
    if (style.style_key === 'tone-reference' || style.requires_reference) {
      // 톤먹 넣기 등 레퍼런스 필수: 레퍼런스 파일 선택 다이얼로그 표시 (필수)
      if (!webtoonId) {
        alert('웹툰을 선택해주세요.');
        return;
      }
      setPendingReferenceStyle(style);
      setSelectedReferenceFile(null);
      setReferenceSelectionOpen(true);
      onStyleSelectionChange(false);
    } else if (style.style_key === 'manga-shading') {
      // 만화풍 명암: 컨펌 다이얼로그 표시
      setPendingMangaShadingStyle(style);
      setMangaShadingConfirmOpen(true);
    } else if (style.allow_multiple) {
      // 괴수디테일 등: 장 수 선택 다이얼로그 표시
      setSelectedStyle(style);
      setCountSelectionOpen(true);
    } else {
      // 배경지우기, 채색 빼기: 바로 실행 (1장)
      onRegenerate(style.prompt, style.default_count);
      onStyleSelectionChange(false);
    }
  };

  const handleMangaShadingConfirm = async () => {
    if (!pendingMangaShadingStyle) return;

    setMangaShadingConfirmOpen(false);
    onStyleSelectionChange(false);

    // 선화만 먼저 생성하기 - DB에서 찾기
    const lineArtStyle = styles.find(s => s.style_key === 'line-art-only');
    if (lineArtStyle) {
      // 선화만 남기기 실행 (1장)
      onRegenerate(lineArtStyle.prompt, 1);
    } else {
      // 선화 스타일을 찾지 못한 경우 일반적으로 실행
      onRegenerate(pendingMangaShadingStyle.prompt, pendingMangaShadingStyle.default_count);
    }

    setPendingMangaShadingStyle(null);
  };

  const handleMangaShadingCancel = () => {
    // 바로 명암 넣기: 설정에서 레퍼런스 사용 여부 확인
    if (pendingMangaShadingStyle) {
      const useReference = styleSettings[pendingMangaShadingStyle.style_key] ?? false;
      if (useReference && webtoonId) {
        setPendingReferenceStyle(pendingMangaShadingStyle);
        setSelectedReferenceFile(null);
        setMangaShadingConfirmOpen(false);
        setReferenceSelectionOpen(true);
      } else {
        setSelectedStyle(pendingMangaShadingStyle);
        setMangaShadingConfirmOpen(false);
        setCountSelectionOpen(true);
      }
    } else {
      setMangaShadingConfirmOpen(false);
      setPendingMangaShadingStyle(null);
    }
  };

  const handleCountConfirm = async () => {
    if (selectedStyle) {
      // 설정에서 레퍼런스 사용 여부 확인
      const useReference = styleSettings[selectedStyle.style_key] ?? false;
      if (useReference && webtoonId) {
        setPendingReferenceStyle(selectedStyle);
        setSelectedReferenceFile(null);
        setCountSelectionOpen(false);
        setReferenceSelectionOpen(true);
      } else {
        // 프롬프트가 선택되어 있으면 기본으로 설정
        if (selectedPromptId && currentUserId) {
          try {
            await setPromptAsDefault(selectedPromptId, selectedStyle.style_key);
          } catch (error) {
            console.error('프롬프트 기본 설정 실패:', error);
            // 에러가 발생해도 계속 진행
          }
        }

        onRegenerate(editedPrompt.trim() || selectedStyle.prompt, generationCount);
        setCountSelectionOpen(false);
        setSelectedStyle(null);
        onStyleSelectionChange(false);
        // 상태 초기화
        setSelectedPromptId(null);
        setEditedPrompt('');
        setPromptEditOpen(false);
      }
    }
  };

  // 레퍼런스 파일 선택 후 다음 단계 (장수 선택)
  const handleReferenceSelect = (file: ReferenceFileWithProcess) => {
    setSelectedReferenceFile(file);
  };

  // 레퍼런스 선택 + 장수 선택 통합 확인
  const handleReferenceDirectConfirm = async () => {
    if (!selectedReferenceFile || !pendingReferenceStyle) return;

    // 프롬프트가 선택되어 있으면 기본으로 설정
    if (selectedPromptId && currentUserId) {
      try {
        await setPromptAsDefault(selectedPromptId, pendingReferenceStyle.style_key);
      } catch (error) {
        console.error('프롬프트 기본 설정 실패:', error);
        // 에러가 발생해도 계속 진행
      }
    }

    const referenceImage: ReferenceImageInfo = {
      id: selectedReferenceFile.id,
    };

    // 레퍼런스 선택 다이얼로그에서 이미 장수를 선택할 수 있으므로 바로 생성
    // (레퍼런스 선택 다이얼로그에 장수 선택이 포함되어 있음)
    onRegenerate(editedPrompt.trim() || pendingReferenceStyle.prompt, generationCount, false, referenceImage);
    setReferenceSelectionOpen(false);
    setSelectedReferenceFile(null);
    setPendingReferenceStyle(null);
    // 상태 초기화
    setSelectedPromptId(null);
    setEditedPrompt('');
    setPromptEditOpen(false);
  };

  // 장수 선택 후 최종 확인 (레퍼런스 포함)
  const handleCountConfirmWithReference = async () => {
    if (selectedStyle && selectedReferenceFile) {
      // 프롬프트가 선택되어 있으면 기본으로 설정
      if (selectedPromptId && currentUserId) {
        try {
          await setPromptAsDefault(selectedPromptId, selectedStyle.style_key);
        } catch (error) {
          console.error('프롬프트 기본 설정 실패:', error);
          // 에러가 발생해도 계속 진행
        }
      }

      const referenceImage: ReferenceImageInfo = {
        id: selectedReferenceFile.id,
      };
      onRegenerate(editedPrompt.trim() || selectedStyle.prompt, generationCount, false, referenceImage);
      setCountSelectionOpen(false);
      setSelectedStyle(null);
      setSelectedReferenceFile(null);
      setPendingReferenceStyle(null);
      onStyleSelectionChange(false);
      // 상태 초기화
      setSelectedPromptId(null);
      setEditedPrompt('');
      setPromptEditOpen(false);
    }
  };

  // 레퍼런스 선택 취소
  const handleReferenceCancel = () => {
    setReferenceSelectionOpen(false);
    setSelectedReferenceFile(null);
    setPendingReferenceStyle(null);
  };

  // 레퍼런스 업로드 완료 핸들러
  const handleReferenceUploadComplete = async (uploadedFile?: ReferenceFile) => {
    // 레퍼런스 파일 목록 새로고침
    if (webtoonId) {
      try {
        const files = await getReferenceFilesByWebtoon(webtoonId);
        const imageFiles = files.filter(f => f.file_type === 'image');
        setReferenceFiles(imageFiles);
        // 업로드된 파일이 있으면 해당 파일을 찾아서 선택, 없으면 가장 최근 파일 선택
        if (uploadedFile && uploadedFile.file_type === 'image') {
          const foundFile = imageFiles.find(f => f.id === uploadedFile.id);
          if (foundFile) {
            setSelectedReferenceFile(foundFile);
          } else if (imageFiles.length > 0) {
            setSelectedReferenceFile(imageFiles[0]);
          }
        } else if (imageFiles.length > 0) {
          setSelectedReferenceFile(imageFiles[0]);
        }
      } catch (error) {
        console.error('레퍼런스 파일 로드 실패:', error);
      }
    }
  };

  // 스타일을 그룹별로 분류
  const groupedStyles = styles.reduce((acc, style) => {
    const groupKey = style.group_name || '기타';
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(style);
    return acc;
  }, {} as Record<string, AiRegenerationStyle[]>);

  // 그룹 정렬 (기타는 마지막에)
  const sortedGroups = Object.keys(groupedStyles).sort((a, b) => {
    if (a === '기타') return 1;
    if (b === '기타') return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      {/* 스타일 선택 Dialog */}
      <Dialog open={styleSelectionOpen} onOpenChange={onStyleSelectionChange}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>스타일 선택</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  onStyleSelectionChange(false);
                  setStyleManagementOpen(true);
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>이미지를 재생성할 스타일을 선택하세요.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-4 pr-4">
              {loadingStyles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : styles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  등록된 스타일이 없습니다.
                </div>
              ) : (
                sortedGroups.map((groupName) => (
                  <div key={groupName} className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground px-1">
                      {groupName}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {groupedStyles[groupName].map((style) => (
                        <Button
                          key={style.id}
                          variant="outline"
                          className="h-auto py-3 flex flex-col items-center gap-1"
                          onClick={() => handleStyleClick(style)}
                          disabled={regeneratingImage !== null}
                        >
                          <span className="text-sm font-medium">{style.name}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => onStyleSelectionChange(false)} disabled={regeneratingImage !== null}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 장 수 선택 Dialog (레퍼런스 없는 스타일용 또는 레퍼런스 선택 후) */}
      <Dialog open={countSelectionOpen} onOpenChange={setCountSelectionOpen}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>생성 설정</DialogTitle>
            <DialogDescription>
              프롬프트를 선택하거나 편집하고 생성할 장수를 설정하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedReferenceFile && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">선택된 레퍼런스 이미지</p>
                <p className="text-xs text-muted-foreground truncate">{selectedReferenceFile.file_name}</p>
              </div>
            )}
            
            {/* 프롬프트 선택 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">프롬프트 선택</label>
              {loadingPrompts ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select 
                  value={selectedPromptId || 'custom'} 
                  onValueChange={(value) => {
                    if (value === 'custom') {
                      setSelectedPromptId(null);
                      if (selectedStyle) {
                        setEditedPrompt(selectedStyle.prompt);
                      }
                    } else {
                      setSelectedPromptId(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">직접 입력</SelectItem>
                    {prompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.prompt_name} {prompt.is_default ? '(기본)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 프롬프트 편집 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">프롬프트 내용</label>
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="프롬프트를 입력하세요..."
              />
            </div>

            {/* 프롬프트 수정 버튼 */}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPromptEditOpen(!promptEditOpen)}
                className="w-full"
              >
                {promptEditOpen ? '프롬프트 숨기기' : '프롬프트 수정'}
              </Button>
            </div>

            {/* 프롬프트 선택 및 편집 (조건부 표시) */}
            {promptEditOpen && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">프롬프트 선택</label>
                  {loadingPrompts ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Select 
                      value={selectedPromptId || 'custom'} 
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setSelectedPromptId(null);
                          if (selectedStyle) {
                            setEditedPrompt(selectedStyle.prompt);
                          }
                        } else {
                          setSelectedPromptId(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
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
                </div>

                {/* 프롬프트 편집 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">프롬프트 내용</label>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="프롬프트를 입력하세요..."
                  />
                </div>
              </>
            )}

            {/* 생성 장수 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">생성 장수</label>
              <Select value={generationCount.toString()} onValueChange={(value) => onGenerationCountChange(parseInt(value))}>
                <SelectTrigger className="w-full">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountSelectionOpen(false)} disabled={regeneratingImage !== null}>
              취소
            </Button>
            <Button 
              onClick={selectedReferenceFile ? handleCountConfirmWithReference : handleCountConfirm} 
              disabled={regeneratingImage !== null}
            >
              생성하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 레퍼런스 파일 선택 Dialog (모든 스타일에서 사용) */}
      <Dialog open={referenceSelectionOpen} onOpenChange={(open) => {
        if (!open) handleReferenceCancel();
        else setReferenceSelectionOpen(open);
      }}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pendingReferenceStyle?.style_key === 'tone-reference' ? '톤먹 넣기' : '레퍼런스 이미지 선택'}
          </DialogTitle>
        </DialogHeader>
          <div className="py-4 space-y-4">
            {loadingReferences ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* 레퍼런스 이미지 그리드와 장수 선택 그룹 */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">참조 이미지</p>
                  <div className="grid grid-cols-3 gap-2">
                    {/* 업로드 버튼 슬롯 */}
                    <button
                      type="button"
                      onClick={() => setUploadDialogOpen(true)}
                      disabled={regeneratingImage !== null}
                      className="aspect-square bg-muted border-2 border-dashed border-muted-foreground/25 rounded-md hover:border-primary/50 hover:bg-muted/80 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-8 w-8 text-muted-foreground" />
                    </button>
                    {referenceFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`cursor-pointer transition-all overflow-hidden rounded-md ${
                          selectedReferenceFile?.id === file.id
                            ? 'ring-2 ring-primary'
                            : 'hover:ring-1 hover:ring-primary/50'
                        }`}
                        onClick={() => handleReferenceSelect(file)}
                      >
                        <div className="aspect-square bg-muted overflow-hidden relative">
                          <img
                            src={file.thumbnail_path
                              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${file.thumbnail_path}`
                              : file.file_path}
                            alt={file.file_name}
                            className="w-full h-full object-cover"
                          />
                          {selectedReferenceFile?.id === file.id && (
                            <div className="absolute top-1 right-1">
                              <div className="bg-primary rounded-full p-0.5">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 장수 선택 */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium whitespace-nowrap">생성 장수</label>
                    <Select value={generationCount.toString()} onValueChange={(value) => onGenerationCountChange(parseInt(value))}>
                      <SelectTrigger className="w-24">
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
                </div>
              </div>
            )}

            {/* 프롬프트 수정 버튼 */}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPromptEditOpen(!promptEditOpen)}
                className="w-full"
              >
                {promptEditOpen ? '프롬프트 숨기기' : '프롬프트 수정'}
              </Button>
            </div>

            {/* 프롬프트 선택 및 편집 (조건부 표시) */}
            {promptEditOpen && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">프롬프트 선택</label>
                  {loadingPrompts ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Select 
                      value={selectedPromptId || 'custom'} 
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setSelectedPromptId(null);
                          if (pendingReferenceStyle) {
                            setEditedPrompt(pendingReferenceStyle.prompt);
                          }
                        } else {
                          setSelectedPromptId(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
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
                </div>

                {/* 프롬프트 편집 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">프롬프트 내용</label>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="프롬프트를 입력하세요..."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleReferenceCancel} disabled={regeneratingImage !== null}>
              취소
            </Button>
            <Button
              onClick={handleReferenceDirectConfirm}
              disabled={!selectedReferenceFile || regeneratingImage !== null}
            >
              생성하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 레퍼런스 파일 업로드 Dialog */}
      {webtoonId && (
        <ReferenceFileUpload
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          webtoonId={webtoonId}
          processes={processes}
          onUploadComplete={handleReferenceUploadComplete}
        />
      )}

      {/* 만화풍 명암 컨펌 Dialog */}
      <Dialog open={mangaShadingConfirmOpen} onOpenChange={setMangaShadingConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>처리 방법 선택</DialogTitle>
            <DialogDescription>
              먼저 선화만 남긴 후 명암을 넣는 것이 효과가 좋습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              원하는 처리 방법을 선택하세요. 선화를 먼저 생성하면 확인 후 파일로 등록하여 사용할 수 있습니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleMangaShadingCancel} disabled={regeneratingImage !== null}>
              바로 명암 넣기
            </Button>
            <Button onClick={handleMangaShadingConfirm} disabled={regeneratingImage !== null}>
              선화 먼저 생성하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 스타일 관리 Dialog */}
      <StyleManagementDialog
        open={styleManagementOpen}
        onOpenChange={(open) => {
          setStyleManagementOpen(open);
          // 스타일 관리 다이얼로그가 닫힐 때 스타일 선택 다이얼로그 다시 열기
          if (!open) {
            onStyleSelectionChange(true);
          }
        }}
        onStylesChange={loadStyles}
      />
    </>
  );
}

