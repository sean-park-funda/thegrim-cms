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
import { getSheetsByCharacter, uploadCharacterSheet, saveCharacterSheetFromBase64, deleteCharacterSheet } from '@/lib/api/characterSheets';
import { useStore } from '@/lib/store/useStore';
import { canCreateContent, canDeleteContent } from '@/lib/utils/permissions';
import { ImageViewer } from './ImageViewer';

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

  // 드래그 앤 드롭 상태
  const [isDragging, setIsDragging] = useState(false);

  const loadSheets = useCallback(async () => {
    if (!character.id) return;
    try {
      setLoading(true);
      const data = await getSheetsByCharacter(character.id);
      setSheets(data);
    } catch (error) {
      console.error('캐릭터 시트 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [character.id]);

  useEffect(() => {
    if (open) {
      loadSheets();
      setActiveTab('list');
      setSourceImage(null);
      setGeneratedImage(null);
      setGeneratedDescription('');
      setUploadDescription('');
      setViewerSheet(null);
    }
  }, [open, loadSheets]);

  // 직접 업로드 핸들러
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    try {
      setUploading(true);
      await uploadCharacterSheet(file, character.id, uploadDescription || undefined);
      await loadSheets();
      setUploadDescription('');
      setActiveTab('list');
      alert('캐릭터 시트가 업로드되었습니다.');
    } catch (error) {
      console.error('캐릭터 시트 업로드 실패:', error);
      alert('캐릭터 시트 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // AI 생성을 위한 소스 이미지 선택
  const handleSourceImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
  };

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
      const fileName = `${character.name}-character-sheet`;
      await saveCharacterSheetFromBase64(
        generatedImage.base64,
        generatedImage.mimeType,
        character.id,
        fileName,
        generatedDescription || 'AI 생성 캐릭터 시트'
      );
      await loadSheets();
      setSourceImage(null);
      setGeneratedImage(null);
      setGeneratedDescription('');
      setActiveTab('list');
      alert('캐릭터 시트가 저장되었습니다.');
    } catch (error) {
      console.error('캐릭터 시트 저장 실패:', error);
      alert('캐릭터 시트 저장에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // 시트 삭제
  const handleDeleteSheet = async (sheet: CharacterSheet) => {
    if (!confirm('이 캐릭터 시트를 삭제하시겠습니까?')) return;

    try {
      await deleteCharacterSheet(sheet.id);
      await loadSheets();
    } catch (error) {
      console.error('캐릭터 시트 삭제 실패:', error);
      alert('캐릭터 시트 삭제에 실패했습니다.');
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
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                {/* 왼쪽: 소스 이미지 선택 */}
                <div className="space-y-4">
                  <h3 className="font-medium">1. 캐릭터 이미지 선택</h3>
                  <p className="text-sm text-muted-foreground">
                    캐릭터가 나온 이미지를 업로드하면 4방향(정면, 오른쪽, 뒷면, 3/4) 캐릭터 시트를 생성합니다.
                  </p>

                  {sourceImage ? (
                    <div className="relative">
                      <img
                        src={`data:${sourceImage.mimeType};base64,${sourceImage.base64}`}
                        alt="소스 이미지"
                        className="w-full max-h-[300px] object-contain rounded-lg border"
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
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        isDragging
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => sourceImageInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <Plus className={`h-12 w-12 mx-auto mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className={`text-sm ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}>
                        {isDragging ? '여기에 이미지를 놓으세요' : '클릭 또는 드래그하여 캐릭터 이미지 선택'}
                      </p>
                    </div>
                  )}

                  <input
                    ref={sourceImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSourceImageSelect}
                    className="hidden"
                  />

                  <Button
                    onClick={handleGenerate}
                    disabled={!sourceImage || generating}
                    className="w-full gap-2"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        캐릭터 시트 생성
                      </>
                    )}
                  </Button>
                </div>

                {/* 오른쪽: 생성 결과 */}
                <div className="space-y-4">
                  <h3 className="font-medium">2. 생성 결과</h3>

                  {generatedImage ? (
                    <>
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          // 생성된 이미지는 임시이므로 별도 처리
                          const dataUrl = `data:${generatedImage.mimeType};base64,${generatedImage.base64}`;
                          const link = document.createElement('a');
                          link.href = dataUrl;
                          link.download = `${character.name}-character-sheet-generated.png`;
                          link.target = '_blank';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        <img
                          src={`data:${generatedImage.mimeType};base64,${generatedImage.base64}`}
                          alt="생성된 캐릭터 시트"
                          className="w-full max-h-[300px] object-contain rounded-lg border"
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
    </>
  );
}

