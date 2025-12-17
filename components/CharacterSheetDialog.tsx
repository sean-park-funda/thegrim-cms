'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Upload, Sparkles, Trash2, Download, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { CharacterWithSheets, CharacterSheet } from '@/lib/supabase';
import { getSheetsByCharacter, uploadCharacterSheet, deleteCharacterSheet } from '@/lib/api/characterSheets';
import { useStore } from '@/lib/store/useStore';
import { canCreateContent, canDeleteContent } from '@/lib/utils/permissions';
import { ImageViewer } from './ImageViewer';
import { useImageModel } from '@/lib/contexts/ImageModelContext';

interface CharacterSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: CharacterWithSheets;
}

export function CharacterSheetDialog({
  open,
  onOpenChange,
  character,
}: CharacterSheetDialogProps) {
  const { profile } = useStore();
  const { model: globalModel } = useImageModel();
  const [sheets, setSheets] = useState<CharacterSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('list');

  // 업로드 상태
  const [uploading, setUploading] = useState(false);
  const [uploadDescription, setUploadDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI 생성 상태
  const [generating, setGenerating] = useState(false);
  const [sourceImage, setSourceImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [generatedImage, setGeneratedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [generatedDescription, setGeneratedDescription] = useState('');
  const sourceImageInputRef = useRef<HTMLInputElement>(null);

  // 뷰어 상태
  const [viewerSheet, setViewerSheet] = useState<CharacterSheet | null>(null);
  const [viewerGeneratedImage, setViewerGeneratedImage] = useState<{ base64: string; mimeType: string } | null>(null);

  // 드래그 앤 드롭 상태
  const [isDragging, setIsDragging] = useState(false);
  
  // 클립보드 붙여넣기 상태
  const isProcessingPaste = useRef(false);

  const isMountedRef = useRef(true);

  const loadSheets = useCallback(async () => {
    if (!character.id || !isMountedRef.current) return;
    
    try {
      setLoading(true);
      const data = await getSheetsByCharacter(character.id);
      
      if (!isMountedRef.current) return;
      
      setSheets(data);
    } catch (error) {
      if (!isMountedRef.current) return;
      
      console.error('캐릭터 시트 목록 로드 실패:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [character.id]);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (open) {
      loadSheets();
      setActiveTab('list');
      setSourceImage(null);
      setGeneratedImage(null);
      setGeneratedDescription('');
      setUploadDescription('');
      setViewerSheet(null);
      setViewerGeneratedImage(null);
    } else {
      // 다이얼로그가 닫힐 때 상태 초기화
      setSheets([]);
      setLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [open, loadSheets]);

  // 직접 업로드 핸들러
  const handleFileSelect = useCallback(async (file: File) => {
    console.log('[CharacterSheetDialog][handleFileSelect] 업로드 시도 시작', {
      characterId: character.id,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    if (!file.type.startsWith('image/')) {
      console.warn('[CharacterSheetDialog][handleFileSelect] 이미지가 아닌 파일 업로드 시도 차단', {
        fileType: file.type,
      });
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    try {
      setUploading(true);

      // File -> base64 데이터 URL 변환
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });

      const [header, base64] = dataUrl.split(',');
      const mimeMatch = header.match(/^data:(.*);base64$/);
      const mimeType = mimeMatch?.[1] || file.type || 'image/png';

      console.log('[CharacterSheetDialog][handleFileSelect] 직접 업로드 탭 - save-sheet API로 업로드 시도', {
        characterId: character.id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      // API를 통해 업로드 (Supabase Storage 네트워크 이슈 회피)
      const response = await fetch(`/api/characters/${character.id}/save-sheet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64,
          mimeType,
          fileName: file.name,
          description: uploadDescription || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[CharacterSheetDialog][handleFileSelect] save-sheet API 업로드 실패', {
          status: response.status,
          error: errorData,
        });
        throw new Error(errorData?.error || '캐릭터 시트 업로드에 실패했습니다.');
      }

      console.log('[CharacterSheetDialog][handleFileSelect] save-sheet API 업로드 성공');

      if (isMountedRef.current) {
        console.log('[CharacterSheetDialog][handleFileSelect] 업로드 성공, 시트 목록 재로딩');
        await loadSheets();
        setUploadDescription('');
        setActiveTab('list');
        alert('캐릭터 시트가 업로드되었습니다.');
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('[CharacterSheetDialog][handleFileSelect] 캐릭터 시트 업로드 실패', {
          error,
          characterId: character.id,
          fileName: file.name,
        });
        alert(error instanceof Error ? error.message : '캐릭터 시트 업로드에 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  }, [character.id, uploadDescription, loadSheets]);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileSelect(file);
  };

  // AI 생성을 위한 소스 이미지 선택
  const handleSourceImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 선택 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64 = result.split(',')[1];
      setSourceImage({
        base64,
        mimeType: file.type,
        name: file.name,
      });
      setGeneratedImage(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSourceImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSourceImageSelect(file);
  };

  // 드래그 앤 드롭으로 소스 이미지 선택
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleSourceImageSelect(file);
  };

  // 클립보드에서 이미지 붙여넣기 처리
  const handlePasteFromClipboard = useCallback(async (e: ClipboardEvent) => {
    // Dialog가 닫혀있으면 무시
    if (!open) {
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
    if (!profile || !canCreateContent(profile.role)) {
      return;
    }

    // 업로드 탭 또는 생성 탭이 활성화되어 있을 때만 처리
    if (activeTab !== 'upload' && activeTab !== 'generate') {
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
      // 이미지가 아니면 무시
      return;
    }

    // 기본 동작 방지
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    try {
      // Blob으로 변환
      const blob = imageItem.getAsFile();
      if (!blob) {
        console.warn('[CharacterSheetDialog][handlePasteFromClipboard] 클립보드에서 Blob을 가져올 수 없음');
        return;
      }

      console.log('[CharacterSheetDialog][handlePasteFromClipboard] 클립보드 이미지 처리 시작', {
        blobType: blob.type,
        blobSize: blob.size,
      });

      // Blob을 ArrayBuffer로 읽어서 완전히 새로운 File 객체 생성
      const arrayBuffer = await blob.arrayBuffer();
      const timestamp = Date.now();
      const fileExtension = blob.type.split('/')[1] || 'png';
      const fileName = `clipboard-${timestamp}.${fileExtension}`;
      const file = new File([arrayBuffer], fileName, { type: blob.type });

      console.log('[CharacterSheetDialog][handlePasteFromClipboard] File 객체 생성 완료', {
        fileName,
        fileSize: file.size,
        fileType: file.type,
      });

      // 탭에 따라 다른 처리
      if (activeTab === 'upload') {
        // 업로드 중 상태 표시
        if (isMountedRef.current) {
          setUploading(true);
        }

        // 직접 업로드 탭: 서버 API를 통해 저장 (Supabase Storage 네트워크 이슈 회피)
        console.log('[CharacterSheetDialog][handlePasteFromClipboard] 업로드 탭 - save-sheet API로 업로드 시도', {
          characterId: character.id,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });

        // File -> base64 데이터 URL 변환
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        });

        const [header, base64] = dataUrl.split(',');
        const mimeMatch = header.match(/^data:(.*);base64$/);
        const mimeType = mimeMatch?.[1] || file.type || 'image/png';

        try {
          const response = await fetch(`/api/characters/${character.id}/save-sheet`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imageData: base64,
              mimeType,
              fileName: file.name,
              description: uploadDescription || undefined,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('[CharacterSheetDialog][handlePasteFromClipboard] save-sheet API 업로드 실패', {
              status: response.status,
              error: errorData,
            });
            alert('클립보드 이미지 업로드에 실패했습니다.');
            return;
          }

          console.log('[CharacterSheetDialog][handlePasteFromClipboard] save-sheet API 업로드 성공');

          if (isMountedRef.current) {
            await loadSheets();
            setUploadDescription('');
            setActiveTab('list');
            alert('캐릭터 시트가 업로드되었습니다.');
          }
        } catch (apiError) {
          console.error('[CharacterSheetDialog][handlePasteFromClipboard] save-sheet API 호출 중 오류', apiError);
          alert('클립보드 이미지 업로드 중 오류가 발생했습니다.');
        }
      } else if (activeTab === 'generate') {
        // AI 생성 탭: 소스 이미지로 설정
        handleSourceImageSelect(file);
      }
    } catch (error) {
      console.error('클립보드 이미지 붙여넣기 실패:', error);
      alert('클립보드 이미지 붙여넣기에 실패했습니다.');
    } finally {
      // 처리 완료 후 플래그/로딩 상태 해제
      setTimeout(() => {
        isProcessingPaste.current = false;
        if (isMountedRef.current && activeTab === 'upload') {
          setUploading(false);
        }
      }, 500);
    }
  }, [open, activeTab, profile, handleFileSelect, handleSourceImageSelect]);

  // 클립보드 붙여넣기 이벤트 리스너 등록
  useEffect(() => {
    if (!open) {
      return;
    }

    window.addEventListener('paste', handlePasteFromClipboard, true);

    return () => {
      window.removeEventListener('paste', handlePasteFromClipboard, true);
    };
  }, [open, handlePasteFromClipboard]);

  // AI 캐릭터 시트 생성
  const handleGenerate = async () => {
    if (!sourceImage) {
      alert('캐릭터 이미지를 먼저 선택해주세요.');
      return;
    }

    try {
      setGenerating(true);
      const response = await fetch('/api/generate-character-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: sourceImage.base64,
          imageMimeType: sourceImage.mimeType,
          apiProvider: globalModel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '캐릭터 시트 생성에 실패했습니다.');
      }

      const data = await response.json();
      setGeneratedImage({
        base64: data.imageData,
        mimeType: data.mimeType,
      });
    } catch (error) {
      console.error('캐릭터 시트 생성 실패:', error);
      alert(error instanceof Error ? error.message : '캐릭터 시트 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  // 생성된 이미지 저장
  const handleSaveGenerated = async () => {
    if (!generatedImage) return;

    try {
      setUploading(true);

      console.log('[CharacterSheetDialog][handleSaveGenerated] AI 생성 캐릭터 시트 저장 시도', {
        characterId: character.id,
        mimeType: generatedImage.mimeType,
      });

      const response = await fetch(`/api/characters/${character.id}/save-sheet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: generatedImage.base64,
          mimeType: generatedImage.mimeType,
          fileName: `${character.name}-character-sheet`,
          description: generatedDescription || 'AI 생성 캐릭터 시트',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[CharacterSheetDialog][handleSaveGenerated] save-sheet API 오류', {
          status: response.status,
          error: errorData,
        });
        alert('캐릭터 시트 저장에 실패했습니다.');
        return;
      }

      console.log('[CharacterSheetDialog][handleSaveGenerated] save-sheet API 성공');

      if (isMountedRef.current) {
        await loadSheets();
        setSourceImage(null);
        setGeneratedImage(null);
        setGeneratedDescription('');
        setActiveTab('list');
        alert('캐릭터 시트가 저장되었습니다.');
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('캐릭터 시트 저장 실패:', error);
        alert('캐릭터 시트 저장에 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setUploading(false);
      }
    }
  };

  // 시트 삭제
  const handleDeleteSheet = async (sheet: CharacterSheet) => {
    if (!confirm('이 캐릭터 시트를 삭제하시겠습니까?')) return;

    try {
      await deleteCharacterSheet(sheet.id);
      if (isMountedRef.current) {
        await loadSheets();
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('캐릭터 시트 삭제 실패:', error);
        alert('캐릭터 시트 삭제에 실패했습니다.');
      }
    }
  };

  // 이미지 다운로드
  const handleDownload = async (sheet: CharacterSheet) => {
    try {
      const response = await fetch(sheet.file_path);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sheet.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('파일 다운로드 실패:', error);
      alert('파일 다운로드에 실패했습니다.');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              {character.name} - 캐릭터 시트
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="list">시트 목록 ({sheets.length})</TabsTrigger>
              <TabsTrigger value="upload" disabled={!profile || !canCreateContent(profile.role)}>
                <Upload className="h-4 w-4 mr-1" />
                직접 업로드
              </TabsTrigger>
              <TabsTrigger value="generate" disabled={!profile || !canCreateContent(profile.role)}>
                <Sparkles className="h-4 w-4 mr-1" />
                AI 생성
              </TabsTrigger>
            </TabsList>

            {/* 시트 목록 */}
            <TabsContent value="list" className="flex-1 overflow-hidden mt-4 data-[state=inactive]:hidden">
              <ScrollArea className="h-full">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </div>
                ) : sheets.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground">등록된 캐릭터 시트가 없습니다.</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      직접 업로드하거나 AI로 생성해보세요.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-1">
                    {sheets.map((sheet) => (
                      <div
                        key={sheet.id}
                        className="group relative rounded-lg overflow-hidden border border-border/50 hover:border-border transition-all"
                      >
                        <div
                          className="aspect-square bg-muted cursor-pointer"
                          onClick={() => setViewerSheet(sheet)}
                        >
                          <img
                            src={sheet.file_path}
                            alt={sheet.file_name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {/* 액션 버튼 */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(sheet);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {profile && canDeleteContent(profile.role) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSheet(sheet);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {/* 설명 */}
                        {sheet.description && (
                          <div className="p-2 text-xs text-muted-foreground line-clamp-2">
                            {sheet.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* 직접 업로드 */}
            <TabsContent value="upload" className="flex-1 overflow-auto mt-4 data-[state=inactive]:hidden">
              <div className="space-y-4 h-full flex flex-col justify-center">
                <div className="space-y-2">
                  <label className="text-sm font-medium">설명 (선택)</label>
                  <Input
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="캐릭터 시트에 대한 설명 (예: 전신 정면, 의상 A)"
                  />
                </div>

                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    클릭하여 이미지를 선택하거나 드래그하여 업로드
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    PNG, JPG, WEBP 지원
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    또는 Ctrl+V로 클립보드 붙여넣기
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={uploading}
                />

                {uploading && (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    업로드 중...
                  </div>
                )}
              </div>
            </TabsContent>

            {/* AI 생성 */}
            <TabsContent value="generate" className="flex-1 overflow-auto mt-4 data-[state=inactive]:hidden">
              <div className="flex gap-6 h-full">
                {/* 왼쪽: 소스 이미지 선택 */}
                <div className="w-[200px] flex-shrink-0 space-y-4">
                  <h3 className="font-medium text-sm">1. 캐릭터 이미지 선택</h3>
                  <p className="text-xs text-muted-foreground">
                    캐릭터 이미지를 업로드하면 4방향 캐릭터 시트를 생성합니다.
                  </p>

                  {sourceImage ? (
                    <div className="relative">
                      <img
                        src={`data:${sourceImage.mimeType};base64,${sourceImage.base64}`}
                        alt="소스 이미지"
                        className="w-full object-contain rounded-lg border"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setSourceImage(null);
                          setGeneratedImage(null);
                          if (sourceImageInputRef.current) {
                            sourceImageInputRef.current.value = '';
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        isDragging
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => sourceImageInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <Plus className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className={`text-xs ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}>
                        {isDragging ? '여기에 놓으세요' : '클릭 또는 드래그'}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Ctrl+V 붙여넣기
                      </p>
                    </div>
                  )}

                  <input
                    ref={sourceImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSourceImageInputChange}
                    className="hidden"
                  />

                  <Button
                    onClick={handleGenerate}
                    disabled={!sourceImage || generating}
                    className="w-full gap-2 text-sm"
                    size="sm"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        생성
                      </>
                    )}
                  </Button>
                </div>

                {/* 오른쪽: 생성 결과 */}
                <div className="flex-1 space-y-4 min-w-0">
                  <h3 className="font-medium">2. 생성 결과</h3>

                  {generatedImage ? (
                    <>
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          setViewerGeneratedImage(generatedImage);
                        }}
                      >
                        <img
                          src={`data:${generatedImage.mimeType};base64,${generatedImage.base64}`}
                          alt="생성된 캐릭터 시트"
                          className="w-full max-h-[600px] object-contain rounded-lg border"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">설명 (선택)</label>
                        <Textarea
                          value={generatedDescription}
                          onChange={(e) => setGeneratedDescription(e.target.value)}
                          placeholder="캐릭터 시트에 대한 설명"
                          rows={2}
                        />
                      </div>

                      <Button
                        onClick={handleSaveGenerated}
                        disabled={uploading}
                        className="w-full gap-2"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            저장 중...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            캐릭터 시트로 저장
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] border-2 border-dashed border-border rounded-lg text-muted-foreground">
                      {generating ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <p>캐릭터 시트를 생성하는 중...</p>
                          <p className="text-sm text-muted-foreground/70">약 30초~1분 소요됩니다.</p>
                        </div>
                      ) : (
                        <p className="text-sm">
                          왼쪽에서 이미지를 선택하고 생성 버튼을 눌러주세요.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 이미지 뷰어 */}
      {viewerSheet && (
        <ImageViewer
          imageUrl={viewerSheet.file_path}
          imageName={viewerSheet.file_name}
          open={!!viewerSheet}
          onOpenChange={(open) => {
            if (!open) {
              setViewerSheet(null);
            }
          }}
          onDownload={() => handleDownload(viewerSheet)}
        />
      )}

      {/* 생성된 이미지 뷰어 */}
      {viewerGeneratedImage && (
        <ImageViewer
          imageUrl={`data:${viewerGeneratedImage.mimeType};base64,${viewerGeneratedImage.base64}`}
          imageName={`${character.name}-character-sheet-generated.png`}
          open={!!viewerGeneratedImage}
          onOpenChange={(open) => {
            if (!open) {
              setViewerGeneratedImage(null);
            }
          }}
          onDownload={() => {
            if (!viewerGeneratedImage) return;
            const dataUrl = `data:${viewerGeneratedImage.mimeType};base64,${viewerGeneratedImage.base64}`;
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${character.name}-character-sheet-generated.png`;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(dataUrl);
            document.body.removeChild(link);
          }}
        />
      )}
    </>
  );
}

