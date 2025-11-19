'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckSquare2, Wand2 } from 'lucide-react';
import { styleOptions } from '@/lib/constants/imageRegeneration';

interface RegeneratedImage {
  id: string;
  url: string;
  prompt: string;
  selected: boolean;
  base64Data: string;
  mimeType: string;
}

interface ImageRegenerationDialogProps {
  styleSelectionOpen: boolean;
  onStyleSelectionChange: (open: boolean) => void;
  onRegenerate: (stylePrompt: string, count?: number) => void;
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
            <div className="grid grid-cols-2 gap-2">
              {styleOptions.map((style) => (
                <Button
                  key={style.id}
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => onRegenerate(style.prompt)}
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
    </>
  );
}

