'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckSquare2, Wand2 } from 'lucide-react';
import { styleOptions } from '@/lib/constants/imageRegeneration';

interface RegeneratedImage {
  id: string;
  url: string | null; // null이면 placeholder (생성 중)
  prompt: string;
  selected: boolean;
  base64Data: string | null; // null이면 placeholder
  mimeType: string | null; // null이면 placeholder
}

interface ImageRegenerationDialogProps {
  styleSelectionOpen: boolean;
  onStyleSelectionChange: (open: boolean) => void;
  onRegenerate: (stylePrompt: string, count?: number, useLatestImageAsInput?: boolean) => void;
  regeneratedImages: RegeneratedImage[];
  selectedImageIds: Set<string>;
  onImageSelect: (id: string, selected: boolean) => void;
  onSaveImages: () => void;
  regeneratingImage: string | null;
  generationCount: number;
  onGenerationCountChange: (count: number) => void;
  fileToViewId: string | null;
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
}: ImageRegenerationDialogProps) {
  const [countSelectionOpen, setCountSelectionOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<typeof styleOptions[0] | null>(null);
  const [mangaShadingConfirmOpen, setMangaShadingConfirmOpen] = useState(false);
  const [pendingMangaShadingStyle, setPendingMangaShadingStyle] = useState<typeof styleOptions[0] | null>(null);

  const handleStyleClick = (style: typeof styleOptions[0]) => {
    if (style.id === 'manga-shading') {
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

      {/* 장 수 선택 Dialog (괴수디테일만) */}
      <Dialog open={countSelectionOpen} onOpenChange={setCountSelectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>생성 개수 선택</DialogTitle>
            <DialogDescription>한번에 몇 장을 그릴지 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <Button variant="outline" onClick={() => setCountSelectionOpen(false)} disabled={regeneratingImage !== null}>
              취소
            </Button>
            <Button onClick={handleCountConfirm} disabled={regeneratingImage !== null}>
              확인
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

