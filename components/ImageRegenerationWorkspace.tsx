'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'; // 내부 다이얼로그용
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, Plus, Wand2, Download, RefreshCw, Search, CheckSquare2, Upload, Settings, ImageIcon, Users, X, ArrowLeft } from 'lucide-react';
import { getReferenceFilesByWebtoon, uploadReferenceFile, deleteReferenceFile } from '@/lib/api/referenceFiles';
import { ReferenceFileWithProcess, Process, ReferenceFile, AiRegenerationPrompt, AiRegenerationStyle, FileWithRelations } from '@/lib/supabase';
import { ReferenceFileUpload } from './ReferenceFileUpload';
import { getProcesses } from '@/lib/api/processes';
import { getImageRegenerationSettings } from '@/lib/api/settings';
import { getPromptsByStyle, setPromptAsDefault } from '@/lib/api/imagePrompts';
import { getStyles } from '@/lib/api/aiStyles';
import { StyleManagementDialog } from './StyleManagementDialog';
import { CharacterSheetSelectDialog, SelectedCharacterSheet } from './CharacterSheetSelectDialog';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useStore } from '@/lib/store/useStore';
import { canDeleteContent } from '@/lib/utils/permissions';

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
  file: FileWithRelations | null;
  webtoonId?: string;
  currentUserId?: string;
  regeneratedImages: RegeneratedImage[];
  selectedImageIds: Set<string>;
  regeneratingImage: string | null;
  savingImages: boolean;
  generationCount: number;
  onGenerationCountChange: (count: number) => void;
  onRegenerate: (stylePrompt: string, count?: number, useLatestImageAsInput?: boolean, referenceImage?: ReferenceImageInfo | ReferenceImageInfo[], targetFileId?: string, characterSheets?: Array<{ sheetId: string }>, apiProvider?: 'gemini' | 'seedream' | 'auto') => void;
  onRegenerateSingle: (prompt: string, apiProvider: 'gemini' | 'seedream' | 'auto', targetImageId?: string) => void;
  onImageSelect: (id: string, selected: boolean) => void;
  onSaveImages: (processId?: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImageViewerOpen: (imageUrl: string, imageName: string) => void;
  processes: Process[];
  canUpload: boolean;
  onBack?: () => void;
  onSaveComplete?: (processId: string) => void;
}

export function ImageRegenerationWorkspace({
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
  onBack,
  onSaveComplete,
}: ImageRegenerationWorkspaceProps) {
  const { profile } = useStore();
  
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
  const [selectedReferenceFiles, setSelectedReferenceFiles] = useState<ReferenceFileWithProcess[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [referenceSelectOpen, setReferenceSelectOpen] = useState(false);
  const [allProcesses, setAllProcesses] = useState<Process[]>([]);
  const [deletingReferenceId, setDeletingReferenceId] = useState<string | null>(null);
  const [tempSelectedReferenceIds, setTempSelectedReferenceIds] = useState<Set<string>>(new Set());
  
  // 임시 레퍼런스 이미지 (클립보드에서 붙여넣은 이미지)
  const [tempReferenceImage, setTempReferenceImage] = useState<{ url: string; name: string } | null>(null);
  const isProcessingPaste = useRef(false);

  // 공정 선택 다이얼로그 상태
  const [processSelectOpen, setProcessSelectOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');

  // 캐릭터 바꾸기 관련 상태
  const [characterSheetSelectOpen, setCharacterSheetSelectOpen] = useState(false);
  const [selectedCharacterSheets, setSelectedCharacterSheets] = useState<SelectedCharacterSheet[]>([]);

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

  // 데이터 로드
  useEffect(() => {
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
  }, []);

  // 레퍼런스 파일 로드
  useEffect(() => {
    const loadReferenceFiles = async () => {
      const needsReference = selectedStyle?.requires_reference || styleSettings[selectedStyle?.style_key || ''];
      if (webtoonId && needsReference) {
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
  }, [webtoonId, selectedStyle, styleSettings]);

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
          // DB에서 가져온 스타일 프롬프트 사용
          setEditedPrompt(selectedStyle.prompt);
        }
      } catch (error) {
        console.error('프롬프트 로드 실패:', error);
        // 프롬프트 로드 실패 시에도 DB에서 가져온 스타일 프롬프트 사용
        setEditedPrompt(selectedStyle.prompt);
      } finally {
        setLoadingPrompts(false);
      }
    };

    if (selectedStyle) {
      loadPrompts();
    }
  }, [selectedStyle, currentUserId]);

  // 선택된 프롬프트 변경 시 편집 프롬프트 업데이트
  useEffect(() => {
    if (selectedPromptId) {
      const prompt = prompts.find(p => p.id === selectedPromptId);
      if (prompt) {
        setEditedPrompt(prompt.prompt_text);
      }
    }
  }, [selectedPromptId, prompts]);

  // 캐릭터 바꾸기 스타일인지 확인
  const isCharacterChangeStyle = selectedStyle?.style_key === 'character-change' || selectedStyle?.name === '캐릭터 바꾸기';

  // 스타일 선택 핸들러
  const handleStyleSelect = (style: AiRegenerationStyle) => {
    setSelectedStyle(style);
    setSelectedReferenceFiles([]);
    setEditedPrompt(style.prompt);
    setSelectedPromptId(null);
    setPromptEditOpen(false);
    
    // 캐릭터 바꾸기 스타일이 아니면 캐릭터시트 선택 초기화
    const isCharacterChange = style.style_key === 'character-change' || style.name === '캐릭터 바꾸기';
    if (!isCharacterChange) {
      setSelectedCharacterSheets([]);
    }
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

    const referenceImages: ReferenceImageInfo[] | undefined = selectedReferenceFiles.length > 0
      ? selectedReferenceFiles.map(file => ({ id: file.id }))
      : undefined;

    const characterSheets = selectedCharacterSheets.length > 0
      ? selectedCharacterSheets.map(sheet => ({ sheetId: sheet.sheetId }))
      : undefined;

    const count = selectedStyle.allow_multiple ? generationCount : selectedStyle.default_count;

    // onRegenerate 시그니처: (stylePrompt, count?, useLatestImageAsInput?, referenceImages?, targetFileId?, characterSheets?, apiProvider?)
    // targetFileId는 undefined로 전달 (fileToView.id를 사용하도록)
    // apiProvider는 스타일의 api_provider 값 사용
    onRegenerate(editedPrompt.trim() || selectedStyle.prompt, count, false, referenceImages, undefined, characterSheets, selectedStyle.api_provider);
  };

  // 레퍼런스 업로드 완료 핸들러
  const handleReferenceUploadComplete = useCallback(async (uploadedFile?: ReferenceFile) => {
    if (webtoonId) {
      try {
        const files = await getReferenceFilesByWebtoon(webtoonId);
        const imageFiles = files.filter(f => f.file_type === 'image');
        setReferenceFiles(imageFiles);
        if (uploadedFile && uploadedFile.file_type === 'image') {
          const foundFile = imageFiles.find(f => f.id === uploadedFile.id);
          if (foundFile) {
            // 이미 선택된 파일이 아니면 추가
            setSelectedReferenceFiles(prev => {
              if (prev.some(f => f.id === foundFile.id)) {
                return prev;
              }
              return [...prev, foundFile];
            });
          }
        }
      } catch (error) {
        console.error('레퍼런스 파일 로드 실패:', error);
      }
    }
  }, [webtoonId]);

  // 참조 이미지 삭제 핸들러
  const handleDeleteReferenceFile = async (fileId: string, fileName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // 클릭 이벤트 전파 방지 (이미지 선택 방지)
    
    if (!confirm(`"${fileName}" 참조 이미지를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      setDeletingReferenceId(fileId);
      await deleteReferenceFile(fileId);
      
      // 삭제된 파일이 선택된 파일 목록에서 제거
      setSelectedReferenceFiles(prev => prev.filter(f => f.id !== fileId));
      
      // 목록 새로고침
      if (webtoonId) {
        const files = await getReferenceFilesByWebtoon(webtoonId);
        const imageFiles = files.filter(f => f.file_type === 'image');
        setReferenceFiles(imageFiles);
      }
      
      alert('참조 이미지가 삭제되었습니다.');
    } catch (error) {
      console.error('참조 이미지 삭제 실패:', error);
      alert('참조 이미지 삭제에 실패했습니다.');
    } finally {
      setDeletingReferenceId(null);
    }
  };

  // 참조 이미지 선택/해제 핸들러
  const handleReferenceFileToggle = (file: ReferenceFileWithProcess) => {
    setTempSelectedReferenceIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(file.id)) {
        newSet.delete(file.id);
      } else {
        newSet.add(file.id);
      }
      return newSet;
    });
  };

  // 선택된 참조 이미지 추가 핸들러
  const handleAddSelectedReferences = () => {
    if (tempSelectedReferenceIds.size === 0) return;

    const newFiles: ReferenceFileWithProcess[] = [];
    tempSelectedReferenceIds.forEach(fileId => {
      const file = referenceFiles.find(f => f.id === fileId);
      if (file && !selectedReferenceFiles.some(f => f.id === fileId)) {
        newFiles.push(file);
      }
    });

    if (newFiles.length > 0) {
      setSelectedReferenceFiles(prev => [...prev, ...newFiles]);
      setTempSelectedReferenceIds(new Set());
      setReferenceSelectOpen(false);
    }
  };

  // 선택된 참조 이미지 제거 핸들러
  const handleRemoveReferenceFile = (fileId: string) => {
    setSelectedReferenceFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 클립보드에서 이미지 붙여넣기 처리
  const handlePasteFromClipboard = useCallback(async (e: ClipboardEvent) => {

    // 레퍼런스 이미지가 필요한 스타일이 선택되지 않았으면 무시
    const needsReference = selectedStyle?.requires_reference || styleSettings[selectedStyle?.style_key || ''];
    
    if (!needsReference || !selectedStyle) {
      return;
    }

    // 이미 처리 중이면 무시 (중복 방지)
    if (isProcessingPaste.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 입력 필드에 포커스가 있으면 기본 동작 허용
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true')
    ) {
      return;
    }

    // 권한 확인
    if (!canUpload) {
      return;
    }

    // webtoonId가 없으면 무시
    if (!webtoonId || allProcesses.length === 0) {
      return;
    }

    const clipboardData = e.clipboardData;
    if (!clipboardData) {
      return;
    }

    // 클립보드에서 이미지 찾기
    const items = Array.from(clipboardData.items);
    const imageItem = items.find((item) => item.type.indexOf('image') !== -1);

    if (!imageItem) {
      return;
    }

    // 이미지를 찾았으면 즉시 이벤트 전파 중단 (다른 핸들러가 실행되지 않도록)
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // 처리 중 플래그 설정
    isProcessingPaste.current = true;

    try {
      // Blob으로 변환
      const blob = imageItem.getAsFile();
      if (!blob) {
        return;
      }

      // File 객체로 변환 (파일명은 타임스탬프 기반)
      const timestamp = Date.now();
      const fileExtension = blob.type.split('/')[1] || 'png';
      const fileName = `clipboard-${timestamp}.${fileExtension}`;
      const file = new File([blob], fileName, { type: blob.type });

      // 첫 번째 공정을 기본값으로 사용
      const defaultProcess = allProcesses.sort((a, b) => a.order_index - b.order_index)[0];
      const processId = defaultProcess?.id || allProcesses[0]?.id;

      if (!processId) {
        alert('공정을 선택할 수 없습니다.');
        return;
      }

      console.log('[ImageRegenerationWorkspace] 레퍼런스 파일 업로드 시작:', { fileName, processId, webtoonId });
      
      // 레퍼런스 파일로 업로드
      const uploadedFile = await uploadReferenceFile(file, webtoonId, processId, '클립보드에서 붙여넣은 이미지');
      
      // 업로드 완료 핸들러 호출하여 레퍼런스 파일 목록 갱신 및 선택
      await handleReferenceUploadComplete(uploadedFile);
    } catch (error) {
      console.error('클립보드 이미지 붙여넣기 실패:', error);
      alert('클립보드 이미지 붙여넣기에 실패했습니다.');
    } finally {
      // 처리 완료 후 플래그 해제
      setTimeout(() => {
        isProcessingPaste.current = false;
      }, 500);
    }
  }, [selectedStyle, styleSettings, canUpload, webtoonId, allProcesses, handleReferenceUploadComplete]);

  // 클립보드 붙여넣기 이벤트 리스너 등록
  useEffect(() => {
    if (!open) {
      return;
    }

    const pasteHandler = (e: ClipboardEvent) => {
      // 다이얼로그가 열려있으면 즉시 이벤트 전파 중단 (FileGrid로 전파 방지)
      e.preventDefault();
      e.stopImmediatePropagation();
      handlePasteFromClipboard(e);
    };

    window.addEventListener('paste', pasteHandler, true);

    return () => {
      window.removeEventListener('paste', pasteHandler, true);
    };
  }, [open, handlePasteFromClipboard]);

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
      onSaveComplete?.(selectedProcessId);
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
      <div className="flex h-full" style={{ flex: '1 1 0', minHeight: 0 }}>
        {/* 왼쪽 패널 - 설정 (고정 너비) */}
        <div className="w-[300px] flex-shrink-0 border-r flex flex-col" style={{ minHeight: 0 }}>
          <div className="flex-shrink-0 bg-background px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={onBack}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                )}
                <h2 className="text-base font-semibold">AI 다시그리기</h2>
              </div>
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

          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3" style={{ flex: '1 1 0', overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
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
                          <CardContent className="px-3 pb-3 pt-0 space-y-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTempSelectedReferenceIds(new Set());
                                setReferenceSelectOpen(true);
                              }}
                              disabled={regeneratingImage !== null}
                              className={cn(
                                "w-full aspect-[4/3] rounded-md overflow-hidden transition-colors flex items-center justify-center disabled:opacity-50",
                                selectedReferenceFiles.length > 0
                                  ? "bg-muted border-2 border-primary/50"
                                  : "bg-muted border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/80"
                              )}
                            >
                              {selectedReferenceFiles.length > 0 ? (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                  <ImageIcon className="h-6 w-6" />
                                  <span className="text-xs font-medium">{selectedReferenceFiles.length}개 선택됨</span>
                                  <span className="text-xs text-muted-foreground/70">클릭하여 추가</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                  <Plus className="h-6 w-6" />
                                  <span className="text-xs">참조 이미지 선택</span>
                                  <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                                    또는 Ctrl+V 붙여넣기
                                  </span>
                                </div>
                              )}
                            </button>
                            {selectedReferenceFiles.length > 0 && (
                              <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                {selectedReferenceFiles.map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-md text-xs"
                                  >
                                    <img
                                      src={file.thumbnail_path
                                        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${file.thumbnail_path}`
                                        : file.file_path}
                                      alt={file.file_name}
                                      className="w-8 h-8 object-cover rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">{file.file_name}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveReferenceFile(file.id);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* 캐릭터 바꾸기 카드 - 캐릭터 바꾸기 스타일 선택 시에만 표시 */}
                      {isCharacterChangeStyle && (
                        <Card>
                          <CardHeader className="py-2 px-3">
                            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" />
                              캐릭터 추가
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-3 pb-3 pt-0 space-y-2">
                            <button
                              type="button"
                              onClick={() => setCharacterSheetSelectOpen(true)}
                              disabled={regeneratingImage !== null || !webtoonId}
                              className={cn(
                                "w-full aspect-[4/3] rounded-md overflow-hidden transition-colors flex items-center justify-center disabled:opacity-50",
                                selectedCharacterSheets.length > 0
                                  ? "bg-muted border-2 border-primary/50"
                                  : "bg-muted border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/80"
                              )}
                            >
                              {selectedCharacterSheets.length > 0 ? (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                  <Users className="h-6 w-6" />
                                  <span className="text-xs font-medium">{selectedCharacterSheets.length}개 선택됨</span>
                                  <span className="text-xs text-muted-foreground/70">클릭하여 변경</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                  <Plus className="h-6 w-6" />
                                  <span className="text-xs">캐릭터시트 선택</span>
                                </div>
                              )}
                            </button>
                            {selectedCharacterSheets.length > 0 && (
                              <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                {selectedCharacterSheets.map((sheet) => (
                                  <div
                                    key={sheet.sheetId}
                                    className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-md text-xs"
                                  >
                                    <img
                                      src={sheet.sheetPath}
                                      alt={sheet.sheetName}
                                      className="w-8 h-8 object-cover rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">{sheet.characterName}</p>
                                      <p className="text-muted-foreground truncate text-[10px]">{sheet.sheetName}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCharacterSheets(selectedCharacterSheets.filter((s) => s.sheetId !== sheet.sheetId));
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
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
                                  {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
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
                        disabled={
                          regeneratingImage !== null || 
                          (needsReference && selectedReferenceFiles.length === 0) || 
                          (isCharacterChangeStyle && selectedCharacterSheets.length === 0)
                        }
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

        {/* 오른쪽 패널 - 결과 (남은 공간 차지) */}
        <div className="flex-1 flex flex-col bg-muted/30" style={{ minHeight: 0 }}>
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
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
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
                                  className="object-contain pointer-events-none"
                                  sizes="(max-width: 768px) 50vw, 25vw"
                                  unoptimized={true}
                                  draggable={false}
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

      {/* 참조 이미지 선택 다이얼로그 */}
      <Dialog open={referenceSelectOpen} onOpenChange={setReferenceSelectOpen}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>참조 이미지 선택</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex-1 overflow-y-auto py-4">
              {loadingReferences ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : referenceFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm">등록된 참조 이미지가 없습니다.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setReferenceSelectOpen(false);
                      setUploadDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    새 참조 이미지 추가
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {referenceFiles.map((refFile) => {
                    const isSelected = tempSelectedReferenceIds.has(refFile.id);
                    const isAlreadyAdded = selectedReferenceFiles.some(f => f.id === refFile.id);

                    return (
                      <div
                        key={refFile.id}
                        className={cn(
                          "cursor-pointer transition-all overflow-hidden rounded-lg aspect-square relative group",
                          isSelected
                            ? "ring-2 ring-primary ring-offset-2"
                            : isAlreadyAdded
                              ? "opacity-50 ring-2 ring-muted"
                              : "hover:ring-2 hover:ring-primary/50 hover:ring-offset-1"
                        )}
                        onClick={() => !isAlreadyAdded && handleReferenceFileToggle(refFile)}
                      >
                        <img
                          src={refFile.thumbnail_path
                            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${refFile.thumbnail_path}`
                            : refFile.file_path}
                          alt={refFile.file_name}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <div className="bg-primary rounded-full p-1">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          </div>
                        )}
                        {isAlreadyAdded && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white text-xs font-medium">추가됨</span>
                          </div>
                        )}
                        {profile && canDeleteContent(profile.role) && (
                          <button
                            className="absolute top-2 left-2 bg-destructive/80 hover:bg-destructive text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            onClick={(e) => handleDeleteReferenceFile(refFile.id, refFile.file_name, e)}
                            disabled={deletingReferenceId === refFile.id}
                            title="삭제"
                          >
                            {deletingReferenceId === refFile.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-xs truncate">{refFile.file_name}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {tempSelectedReferenceIds.size > 0 && (
              <div className="px-3 py-2 border-t">
                <Button
                  onClick={handleAddSelectedReferences}
                  size="sm"
                  className="w-full"
                  disabled={tempSelectedReferenceIds.size === 0}
                >
                  선택한 참조 이미지 추가 ({tempSelectedReferenceIds.size}개)
                </Button>
              </div>
            )}
            {selectedReferenceFiles.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b bg-muted/50">
                  <h3 className="text-sm font-medium">선택된 참조 이미지 ({selectedReferenceFiles.length}개)</h3>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <div className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {selectedReferenceFiles.map((file) => (
                        <div
                          key={file.id}
                          className="relative group flex items-center gap-2 px-3 py-2 bg-muted rounded-lg"
                        >
                          <img
                            src={file.thumbnail_path
                              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${file.thumbnail_path}`
                              : file.file_path}
                            alt={file.file_name}
                            className="w-10 h-10 object-cover rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{file.file_name}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRemoveReferenceFile(file.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setReferenceSelectOpen(false);
                setUploadDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              새 참조 이미지 추가
            </Button>
            <Button variant="outline" onClick={() => setReferenceSelectOpen(false)}>
              닫기
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

      {/* 캐릭터시트 선택 다이얼로그 */}
      {webtoonId && (
        <CharacterSheetSelectDialog
          open={characterSheetSelectOpen}
          onOpenChange={setCharacterSheetSelectOpen}
          webtoonId={webtoonId}
          selectedSheets={selectedCharacterSheets}
          onSheetsChange={setSelectedCharacterSheets}
        />
      )}
    </>
  );
}

