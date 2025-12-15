'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Image as ImageIcon, Palette } from 'lucide-react';
import { getStyles } from '@/lib/api/aiStyles';
import { AiRegenerationStyle } from '@/lib/supabase';

interface HistoryItem {
  fileId: string;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  mimeType: string;
  prompt?: string;
  sourceFileId?: string;
  description?: string;
  metadata?: {
    width?: number;
    height?: number;
    tags?: string[];
    scene_summary?: string;
    aspectRatio?: string;
    source?: string;
    [key: string]: any;
  };
  sourceFile?: {
    id: string;
    filePath: string;
    fileUrl: string;
    fileName: string;
    prompt?: string | null;
    description?: string;
    metadata?: any;
  };
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  webtoon?: {
    id: string;
    title: string;
  };
  episode?: {
    id: string;
    episodeNumber: number;
    title: string;
  };
  cut?: {
    id: string;
    cutNumber: number;
    title: string;
  };
  process?: {
    id: string;
    name: string;
    color: string;
  };
}

interface RemixImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: HistoryItem | null;
}

export function RemixImageDialog({ open, onOpenChange, image }: RemixImageDialogProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [remixing, setRemixing] = useState(false);
  const [styles, setStyles] = useState<AiRegenerationStyle[]>([]);
  const [detectedStyle, setDetectedStyle] = useState<AiRegenerationStyle | null>(null);

  // 스타일 목록 로드
  useEffect(() => {
    const loadStyles = async () => {
      try {
        const data = await getStyles();
        setStyles(data);
      } catch (error) {
        console.error('스타일 목록 로드 실패:', error);
      }
    };
    if (open) {
      loadStyles();
    }
  }, [open]);

  // 이미지가 변경될 때 프롬프트 초기화 및 스타일 감지
  useEffect(() => {
    if (image) {
      setPrompt(image.prompt || '');
      
      // 스타일 감지: metadata에서 style_id 또는 style_key 확인
      let style: AiRegenerationStyle | null = null;
      
      if (image.metadata?.style_id) {
        style = styles.find(s => s.id === image.metadata.style_id) || null;
      } else if (image.metadata?.style_key) {
        style = styles.find(s => s.style_key === image.metadata.style_key) || null;
      }
      
      // metadata에 없으면 프롬프트에서 추론
      if (!style && image.prompt && styles.length > 0) {
        const promptLower = image.prompt.toLowerCase();
        // 프롬프트에 스타일 이름이나 키가 포함되어 있는지 확인
        style = styles.find(s => {
          const styleNameLower = s.name?.toLowerCase() || '';
          const styleKeyLower = s.style_key?.toLowerCase() || '';
          return promptLower.includes(styleNameLower) || promptLower.includes(styleKeyLower);
        }) || null;
      }
      
      setDetectedStyle(style);
    }
  }, [image, styles]);

  const handleRemix = async () => {
    // sourceFileId 또는 sourceFile.id 중 하나라도 있으면 사용
    const sourceFileId = image?.sourceFileId || image?.sourceFile?.id;
    if (!image || !sourceFileId) {
      alert('원본 이미지가 없어 리믹스할 수 없습니다.');
      return;
    }

    if (!prompt.trim()) {
      alert('프롬프트를 입력해주세요.');
      return;
    }

    try {
      setRemixing(true);
      // 원본 파일 ID로 재생성 페이지로 이동
      // 원본 파일이 속한 컷을 자동으로 사용
      router.push(`/files/${sourceFileId}/regenerate?remix=true&prompt=${encodeURIComponent(prompt)}`);
      onOpenChange(false);
    } catch (error) {
      console.error('리믹스 실행 실패:', error);
      alert('리믹스 실행 중 오류가 발생했습니다.');
    } finally {
      setRemixing(false);
    }
  };

  if (!image) return null;

  // sourceFileId 또는 sourceFile.id 중 하나라도 있으면 리믹스 가능
  const hasSourceFile = !!(image.sourceFileId || image.sourceFile?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] w-[90vw] h-[95vh] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            이미지 리믹스
          </DialogTitle>
          <DialogDescription>
            다른 사용자가 생성한 이미지를 기반으로 새로운 이미지를 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* 좌측 패널: 이미지들 */}
          <ScrollArea className="w-[200px] flex-shrink-0 pr-4">
            <div className="space-y-6">
              {/* 원본 이미지 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">원본 이미지</span>
                  {!hasSourceFile && (
                    <Badge variant="outline" className="text-xs">원본 없음</Badge>
                  )}
                </div>
                {hasSourceFile && image.sourceFile?.fileUrl ? (
                  <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
                    <Image
                      src={image.sourceFile.fileUrl}
                      alt="원본 이미지"
                      fill
                      className="object-contain"
                      unoptimized={true}
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      {hasSourceFile ? '원본 이미지 미리보기를 불러올 수 없습니다' : '원본 이미지가 없습니다'}
                    </p>
                  </div>
                )}
                {image.sourceFile && (
                  <div className="text-xs text-muted-foreground">
                    <p className="truncate">{image.sourceFile.fileName}</p>
                    {image.sourceFile.metadata?.tags && Array.isArray(image.sourceFile.metadata.tags) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {image.sourceFile.metadata.tags.slice(0, 5).map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] px-1 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 재생성된 이미지 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">재생성된 이미지</span>
                </div>
                <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
                  <Image
                    src={image.fileUrl}
                    alt="재생성된 이미지"
                    fill
                    className="object-contain"
                    unoptimized={true}
                  />
                </div>
                {image.metadata?.tags && Array.isArray(image.metadata.tags) && (
                  <div className="flex flex-wrap gap-1">
                    {image.metadata.tags.slice(0, 5).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] px-1 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* 우측 패널: 정보 및 기능 */}
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {/* 정보 섹션 */}
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                {detectedStyle && (
                  <div className="flex items-center gap-2 text-xs">
                    <Palette className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      <span className="font-medium">AI 스타일:</span> {detectedStyle.name}
                    </span>
                  </div>
                )}
                {image.creator && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">작업자:</span> {image.creator.name}
                  </div>
                )}
                {image.webtoon && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">웹툰:</span> {image.webtoon.title}
                    {image.episode && ` > ${image.episode.episodeNumber}화`}
                    {image.cut && ` > ${image.cut.cutNumber}${image.cut.title ? `: ${image.cut.title}` : ''}`}
                  </div>
                )}
              </div>

              {/* 프롬프트 표시 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">프롬프트</label>
                <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap break-words">
                  {prompt || <span className="text-muted-foreground">프롬프트가 없습니다</span>}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remixing}>
            취소
          </Button>
          <Button onClick={handleRemix} disabled={remixing || !hasSourceFile || !prompt.trim()}>
            {remixing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                리믹스 중...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                리믹스하기
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

