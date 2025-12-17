'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, Plus, Image as ImageIcon, Type, GripVertical, Loader2, ZoomIn } from 'lucide-react';
import { ContentBlock } from '@/lib/api/announcements';

interface AnnouncementEditorProps {
  initialTitle?: string;
  initialContent?: ContentBlock[];
  onSave: (title: string, content: ContentBlock[]) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function AnnouncementEditor({
  initialTitle = '',
  initialContent = [],
  onSave,
  onCancel,
  isLoading = false,
}: AnnouncementEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<ContentBlock[]>(
    initialContent.length > 0 ? initialContent : [{ type: 'text', value: '' }]
  );
  const [uploadingIndexes, setUploadingIndexes] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // 이미지 업로드 처리
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/announcements/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '이미지 업로드 실패');
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
      alert('이미지 업로드에 실패했습니다.');
      return null;
    }
  }, []);

  // 텍스트 블록 추가
  const addTextBlock = useCallback((afterIndex?: number) => {
    setContent(prev => {
      const newContent = [...prev];
      const insertIndex = afterIndex !== undefined ? afterIndex + 1 : newContent.length;
      newContent.splice(insertIndex, 0, { type: 'text', value: '' });
      return newContent;
    });
  }, []);

  // 이미지 블록 추가 (파일 선택 다이얼로그)
  const handleAddImageClick = useCallback((afterIndex?: number) => {
    setActiveBlockIndex(afterIndex ?? content.length - 1);
    fileInputRef.current?.click();
  }, [content.length]);

  // 파일 선택 처리
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const insertIndex = activeBlockIndex !== null ? activeBlockIndex + 1 : content.length;
    
    // 임시 로딩 상태 추가
    setContent(prev => {
      const newContent = [...prev];
      newContent.splice(insertIndex, 0, { type: 'image', url: '' });
      return newContent;
    });
    setUploadingIndexes(prev => new Set(prev).add(insertIndex));

    const url = await uploadImage(file);
    
    if (url) {
      setContent(prev => {
        const newContent = [...prev];
        newContent[insertIndex] = { type: 'image', url };
        return newContent;
      });
    } else {
      // 업로드 실패 시 블록 제거
      setContent(prev => {
        const newContent = [...prev];
        newContent.splice(insertIndex, 1);
        return newContent;
      });
    }

    setUploadingIndexes(prev => {
      const newSet = new Set(prev);
      newSet.delete(insertIndex);
      return newSet;
    });

    // 파일 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setActiveBlockIndex(null);
  }, [activeBlockIndex, content.length, uploadImage]);

  // 클립보드 붙여넣기 처리
  const handlePaste = useCallback(async (e: React.ClipboardEvent, blockIndex: number) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const insertIndex = blockIndex + 1;

        // 임시 로딩 상태 추가
        setContent(prev => {
          const newContent = [...prev];
          newContent.splice(insertIndex, 0, { type: 'image', url: '' });
          return newContent;
        });
        setUploadingIndexes(prev => new Set(prev).add(insertIndex));

        const url = await uploadImage(file);

        if (url) {
          setContent(prev => {
            const newContent = [...prev];
            newContent[insertIndex] = { type: 'image', url };
            return newContent;
          });
        } else {
          // 업로드 실패 시 블록 제거
          setContent(prev => {
            const newContent = [...prev];
            newContent.splice(insertIndex, 1);
            return newContent;
          });
        }

        setUploadingIndexes(prev => {
          const newSet = new Set(prev);
          newSet.delete(insertIndex);
          return newSet;
        });

        break;
      }
    }
  }, [uploadImage]);

  // 블록 삭제
  const removeBlock = useCallback((index: number) => {
    setContent(prev => {
      if (prev.length <= 1) {
        // 마지막 블록은 빈 텍스트 블록으로 유지
        return [{ type: 'text', value: '' }];
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // 텍스트 블록 내용 변경
  const updateTextBlock = useCallback((index: number, value: string) => {
    setContent(prev => {
      const newContent = [...prev];
      if (newContent[index].type === 'text') {
        newContent[index] = { type: 'text', value };
      }
      return newContent;
    });
  }, []);

  // 저장 처리
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    // 빈 블록 필터링
    const filteredContent = content.filter(block => {
      if (block.type === 'text') {
        return block.value.trim() !== '';
      }
      return block.url !== '';
    });

    if (filteredContent.length === 0) {
      alert('내용을 입력해주세요.');
      return;
    }

    await onSave(title, filteredContent);
  }, [title, content, onSave]);

  return (
    <div className="space-y-4">
      {/* 제목 입력 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">제목</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지사항 제목을 입력하세요"
          disabled={isLoading}
        />
      </div>

      {/* 내용 편집 영역 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">내용</label>
        <p className="text-xs text-muted-foreground">
          텍스트 영역에서 Ctrl+V로 이미지를 붙여넣을 수 있습니다.
        </p>
        
        <div className="space-y-2">
          {content.map((block, index) => (
            <Card key={index} className="relative group">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex items-center text-muted-foreground cursor-move opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1">
                    {block.type === 'text' ? (
                      <Textarea
                        value={block.value}
                        onChange={(e) => updateTextBlock(index, e.target.value)}
                        onPaste={(e) => handlePaste(e, index)}
                        placeholder="텍스트를 입력하세요... (Ctrl+V로 이미지 붙여넣기 가능)"
                        className="min-h-[100px] resize-y"
                        disabled={isLoading}
                      />
                    ) : uploadingIndexes.has(index) ? (
                      <div className="flex items-center justify-center h-48 bg-muted rounded-md">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">업로드 중...</span>
                      </div>
                    ) : (
                      <div 
                        className="relative cursor-pointer group/img"
                        onClick={() => setZoomedImageUrl(block.url)}
                      >
                        <img
                          src={block.url}
                          alt={`이미지 ${index + 1}`}
                          className="w-full max-h-[400px] object-contain rounded-md border bg-muted/30"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors rounded-md flex items-center justify-center">
                          <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeBlock(index)}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* 블록 아래에 추가 버튼 */}
                <div className="flex gap-2 mt-2 pt-2 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addTextBlock(index)}
                    disabled={isLoading}
                  >
                    <Type className="h-3 w-3 mr-1" />
                    텍스트 추가
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddImageClick(index)}
                    disabled={isLoading}
                  >
                    <ImageIcon className="h-3 w-3 mr-1" />
                    이미지 추가
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 새 블록 추가 버튼 */}
        {content.length === 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => addTextBlock()}
              disabled={isLoading}
            >
              <Plus className="h-4 w-4 mr-2" />
              <Type className="h-4 w-4 mr-1" />
              텍스트 추가
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAddImageClick()}
              disabled={isLoading}
            >
              <Plus className="h-4 w-4 mr-2" />
              <ImageIcon className="h-4 w-4 mr-1" />
              이미지 추가
            </Button>
          </div>
        )}
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 버튼 영역 */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          취소
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              저장 중...
            </>
          ) : (
            '저장'
          )}
        </Button>
      </div>

      {/* 이미지 확대 다이얼로그 */}
      {zoomedImageUrl && (
        <Dialog open={true} onOpenChange={(open) => !open && setZoomedImageUrl(null)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-2">
            <DialogTitle className="sr-only">이미지 확대 보기</DialogTitle>
            <div className="relative flex items-center justify-center">
              <img
                src={zoomedImageUrl}
                alt="확대 이미지"
                className="max-w-[90vw] max-h-[90vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
