'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Check, FileIcon } from 'lucide-react';
import { styleOptions } from '@/lib/constants/imageRegeneration';
import { getReferenceFilesByWebtoon } from '@/lib/api/referenceFiles';
import { ReferenceFileWithProcess } from '@/lib/supabase';

interface RegeneratedImage {
  id: string;
  url: string | null; // null이면 placeholder (생성 중)
  prompt: string;
  selected: boolean;
  base64Data: string | null; // null이면 placeholder
  mimeType: string | null; // null이면 placeholder
}

interface ReferenceImageInfo {
  url: string;
  base64?: string;
  mimeType?: string;
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
}: ImageRegenerationDialogProps) {
  const [countSelectionOpen, setCountSelectionOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<typeof styleOptions[0] | null>(null);
  const [mangaShadingConfirmOpen, setMangaShadingConfirmOpen] = useState(false);
  const [pendingMangaShadingStyle, setPendingMangaShadingStyle] = useState<typeof styleOptions[0] | null>(null);

  // 레퍼런스 파일 선택 관련 상태
  const [referenceSelectionOpen, setReferenceSelectionOpen] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFileWithProcess[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [selectedReferenceFile, setSelectedReferenceFile] = useState<ReferenceFileWithProcess | null>(null);
  const [pendingReferenceStyle, setPendingReferenceStyle] = useState<typeof styleOptions[0] | null>(null);

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

  const handleStyleClick = (style: typeof styleOptions[0]) => {
    if (style.id === 'tone-reference') {
      // 톤먹 넣기: 레퍼런스 파일 선택 다이얼로그 표시
      if (!webtoonId) {
        alert('웹툰을 선택해주세요.');
        return;
      }
      setPendingReferenceStyle(style);
      setSelectedReferenceFile(null);
      setReferenceSelectionOpen(true);
      onStyleSelectionChange(false);
    } else if (style.id === 'manga-shading') {
      // 만화풍 명암: 컨펌 다이얼로그 표시
      setPendingMangaShadingStyle(style);
      setMangaShadingConfirmOpen(true);
    } else if (style.allowMultiple) {
      // 괴수디테일 등: 장 수 선택 다이얼로그 표시
      setSelectedStyle(style);
      setCountSelectionOpen(true);
    } else {
      // 배경지우기, 채색 빼기: 바로 실행 (1장)
      onRegenerate(style.prompt, style.defaultCount);
      onStyleSelectionChange(false);
    }
  };

  const handleMangaShadingConfirm = () => {
    if (!pendingMangaShadingStyle) return;
    
    setMangaShadingConfirmOpen(false);
    onStyleSelectionChange(false);
    
    // 선화만 먼저 생성하기
    const lineArtStyle = styleOptions.find(s => s.id === 'line-art-only');
    if (lineArtStyle) {
      // 선화만 남기기 실행 (1장)
      onRegenerate(lineArtStyle.prompt, 1);
    } else {
      // 선화 스타일을 찾지 못한 경우 일반적으로 실행
      onRegenerate(pendingMangaShadingStyle.prompt, pendingMangaShadingStyle.defaultCount);
    }
    
    setPendingMangaShadingStyle(null);
  };

  const handleMangaShadingCancel = () => {
    // 바로 명암 넣기: 장 수 선택 다이얼로그 표시
    if (pendingMangaShadingStyle) {
      setSelectedStyle(pendingMangaShadingStyle);
      setMangaShadingConfirmOpen(false);
      setCountSelectionOpen(true);
    } else {
      setMangaShadingConfirmOpen(false);
      setPendingMangaShadingStyle(null);
    }
  };

  const handleCountConfirm = () => {
    if (selectedStyle) {
      onRegenerate(selectedStyle.prompt, generationCount);
      setCountSelectionOpen(false);
      setSelectedStyle(null);
      onStyleSelectionChange(false);
    }
  };

  // 레퍼런스 파일 선택 후 다음 단계 (장수 선택)
  const handleReferenceSelect = (file: ReferenceFileWithProcess) => {
    setSelectedReferenceFile(file);
  };

  // 레퍼런스 선택 확인 -> 장수 선택 다이얼로그로 이동
  const handleReferenceConfirm = () => {
    if (!selectedReferenceFile || !pendingReferenceStyle) return;
    setReferenceSelectionOpen(false);
    setSelectedStyle(pendingReferenceStyle);
    setCountSelectionOpen(true);
  };

  // 장수 선택 확인 (레퍼런스 포함)
  const handleCountConfirmWithReference = () => {
    if (selectedStyle && selectedReferenceFile) {
      const referenceImage: ReferenceImageInfo = {
        url: selectedReferenceFile.file_path,
      };
      onRegenerate(selectedStyle.prompt, generationCount, false, referenceImage);
      setCountSelectionOpen(false);
      setSelectedStyle(null);
      setSelectedReferenceFile(null);
      setPendingReferenceStyle(null);
    }
  };

  // 레퍼런스 선택 취소
  const handleReferenceCancel = () => {
    setReferenceSelectionOpen(false);
    setSelectedReferenceFile(null);
    setPendingReferenceStyle(null);
  };

  return (
    <>
      {/* 스타일 선택 Dialog */}
      <Dialog open={styleSelectionOpen} onOpenChange={onStyleSelectionChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스타일 선택</DialogTitle>
            <DialogDescription>이미지를 재생성할 스타일을 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-2">
              {styleOptions.map((style) => (
                <Button
                  key={style.id}
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => handleStyleClick(style)}
                  disabled={regeneratingImage !== null}
                >
                  <span className="text-sm font-medium">{style.name}</span>
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onStyleSelectionChange(false)} disabled={regeneratingImage !== null}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 장 수 선택 Dialog */}
      <Dialog open={countSelectionOpen} onOpenChange={setCountSelectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>생성 개수 선택</DialogTitle>
            <DialogDescription>
              {selectedReferenceFile
                ? `레퍼런스: ${selectedReferenceFile.file_name}`
                : '한번에 몇 장을 그릴지 선택하세요.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 선택된 레퍼런스 미리보기 */}
            {selectedReferenceFile && (
              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">선택된 레퍼런스</label>
                <div className="w-32 h-32 bg-muted rounded-md overflow-hidden">
                  <img
                    src={selectedReferenceFile.file_path}
                    alt={selectedReferenceFile.file_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">한번에 몇 장을 그릴지</label>
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
            <Button variant="outline" onClick={() => {
              setCountSelectionOpen(false);
              if (selectedReferenceFile) {
                setSelectedReferenceFile(null);
                setPendingReferenceStyle(null);
              }
            }} disabled={regeneratingImage !== null}>
              취소
            </Button>
            <Button
              onClick={selectedReferenceFile ? handleCountConfirmWithReference : handleCountConfirm}
              disabled={regeneratingImage !== null}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 레퍼런스 파일 선택 Dialog (톤먹 넣기) */}
      <Dialog open={referenceSelectionOpen} onOpenChange={(open) => {
        if (!open) handleReferenceCancel();
        else setReferenceSelectionOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>레퍼런스 이미지 선택</DialogTitle>
            <DialogDescription>
              톤과 명암 스타일을 참고할 레퍼런스 이미지를 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingReferences ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : referenceFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>등록된 레퍼런스 이미지가 없습니다.</p>
                <p className="text-sm mt-1">웹툰의 레퍼런스 파일을 먼저 등록해주세요.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-3 gap-3">
                  {referenceFiles.map((file) => (
                    <Card
                      key={file.id}
                      className={`cursor-pointer transition-all overflow-hidden ${
                        selectedReferenceFile?.id === file.id
                          ? 'ring-2 ring-primary'
                          : 'hover:ring-1 hover:ring-primary/50'
                      }`}
                      onClick={() => handleReferenceSelect(file)}
                    >
                      <CardContent className="p-2">
                        <div className="aspect-square bg-muted rounded-md overflow-hidden relative">
                          <img
                            src={file.file_path}
                            alt={file.file_name}
                            className="w-full h-full object-cover"
                          />
                          {selectedReferenceFile?.id === file.id && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <div className="bg-primary rounded-full p-1">
                                <Check className="h-4 w-4 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-xs mt-1 line-clamp-1 text-center" title={file.file_name}>
                          {file.file_name}
                        </p>
                        {file.process?.name && (
                          <p className="text-xs text-muted-foreground text-center">
                            {file.process.name}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleReferenceCancel} disabled={regeneratingImage !== null}>
              취소
            </Button>
            <Button
              onClick={handleReferenceConfirm}
              disabled={!selectedReferenceFile || regeneratingImage !== null}
            >
              다음
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}

