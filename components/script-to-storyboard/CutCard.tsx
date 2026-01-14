'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, PenLine, Edit, Scissors, Check, Flame, Upload, ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import type { Cut, Storyboard } from './types';
import { YAKONTI_STYLE_PREFIX, YAKONTI_NEGATIVE_PROMPT, YAKONTI_WORKFLOW_NAME } from './types';

export interface CutCardProps {
  cut: Cut;
  cutIndex: number;
  storyboard: Storyboard;
  totalCuts: number;
  // 이미지 관련 상태
  cutImage?: string;
  cutBackgroundImage?: string;
  isDrawing: boolean;
  isLoadingImage: boolean;
  isSplitting: boolean;
  isGeneratingBgDesc: boolean;
  isGeneratingBgImage: boolean;
  // 배경설명 편집 상태
  editingBgDesc: boolean;
  editingBgDescValue: string;
  // 핸들러
  onEditCut: (storyboardId: string, cutIndex: number, cut: Cut) => void;
  onSplitCut: (storyboardId: string, cutIndex: number) => void;
  onDrawCut: (storyboardId: string, cutIndex: number, cut: Cut) => void;
  onGenerateBgDescription: (storyboardId: string, cutIndex: number) => void;
  onUpdateBgDescription: (storyboardId: string, cutIndex: number, value: string) => Promise<void>;
  onGenerateBgImage: (storyboardId: string, cutIndex: number, cut: Cut) => void;
  onViewImage: (imageUrl: string, imageName: string) => void;
  onEditBgDescStart: (key: string, value: string) => void;
  onEditBgDescChange: (value: string) => void;
  onEditBgDescCancel: () => void;
  // 야콘티 이미지 생성 완료 핸들러
  onYakontiImageGenerated?: (storyboardId: string, cutIndex: number, imageUrl: string) => Promise<void>;
}

export function CutCard({
  cut,
  cutIndex,
  storyboard,
  totalCuts,
  cutImage,
  cutBackgroundImage,
  isDrawing,
  isLoadingImage,
  isSplitting,
  isGeneratingBgDesc,
  isGeneratingBgImage,
  editingBgDesc,
  editingBgDescValue,
  onEditCut,
  onSplitCut,
  onDrawCut,
  onGenerateBgDescription,
  onUpdateBgDescription,
  onGenerateBgImage,
  onViewImage,
  onEditBgDescStart,
  onEditBgDescChange,
  onEditBgDescCancel,
  onYakontiImageGenerated,
}: CutCardProps) {
  const cutKey = `${storyboard.id}-${cutIndex}`;

  // 야콘티 관련 로컬 상태
  const [yakontiExpanded, setYakontiExpanded] = useState(false);
  const [yakontiPrompt, setYakontiPrompt] = useState('');
  const [yakontiGeneratingPrompt, setYakontiGeneratingPrompt] = useState(false);
  const [yakontiRefImage, setYakontiRefImage] = useState<File | null>(null);
  const [yakontiRefImagePreview, setYakontiRefImagePreview] = useState<string | null>(null);
  const [yakontiGeneratingImage, setYakontiGeneratingImage] = useState(false);
  const [yakontiError, setYakontiError] = useState<string | null>(null);
  const yakontiFileInputRef = useRef<HTMLInputElement>(null);

  // 야콘티 프롬프트 생성
  const handleGenerateYakontiPrompt = async () => {
    if (!cut.description) {
      setYakontiError('연출/구도 설명이 없습니다.');
      return;
    }
    setYakontiGeneratingPrompt(true);
    setYakontiError(null);
    try {
      const res = await fetch('/api/generate-yakonti-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          description: cut.description,
          background: cut.background || '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '프롬프트 생성에 실패했습니다.');
      }
      const data = await res.json();
      // 스타일 프리픽스 + 생성된 프롬프트
      setYakontiPrompt(YAKONTI_STYLE_PREFIX + data.prompt);
    } catch (err) {
      console.error('야콘티 프롬프트 생성 실패:', err);
      setYakontiError(err instanceof Error ? err.message : '프롬프트 생성에 실패했습니다.');
    } finally {
      setYakontiGeneratingPrompt(false);
    }
  };

  // 레퍼런스 이미지 선택
  const handleYakontiImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setYakontiRefImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setYakontiRefImagePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 야콘티 이미지 생성 (ComfyUI)
  const handleGenerateYakontiImage = async () => {
    if (!yakontiPrompt) {
      setYakontiError('프롬프트가 없습니다. 먼저 프롬프트를 생성하세요.');
      return;
    }
    if (!yakontiRefImage) {
      setYakontiError('레퍼런스 이미지를 업로드하세요.');
      return;
    }
    setYakontiGeneratingImage(true);
    setYakontiError(null);
    try {
      const formData = new FormData();
      formData.append('workflow_name', YAKONTI_WORKFLOW_NAME);
      formData.append('prompt', yakontiPrompt);
      formData.append('negative_prompt', YAKONTI_NEGATIVE_PROMPT);
      formData.append('seed', '-1');
      formData.append('image', yakontiRefImage);

      const res = await fetch('/api/comfyui/generate', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }
      const data = await res.json();
      
      // 부모 컴포넌트에 이미지 저장 요청 (cutImages에 저장 + DB 저장)
      if (onYakontiImageGenerated) {
        await onYakontiImageGenerated(storyboard.id, cutIndex, data.image_url);
      }
    } catch (err) {
      console.error('야콘티 이미지 생성 실패:', err);
      setYakontiError(err instanceof Error ? err.message : '이미지 생성에 실패했습니다.');
    } finally {
      setYakontiGeneratingImage(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              컷 {cut.cutNumber ?? cutIndex + 1}
              {cut.title && <span className="ml-2">{cut.title}</span>}
            </CardTitle>
          </div>
          {cutIndex === 0 && (
            <CardDescription className="text-xs text-muted-foreground">
              {totalCuts}개 컷 · {new Date(storyboard.created_at).toLocaleString()}
            </CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 왼쪽 패널: 컷 내용 + 콘티 그리기 버튼 */}
          <div className="flex flex-col space-y-3 lg:col-span-2">
            {/* 제목 */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-1">제목</h5>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                {cut.title || <span className="text-muted-foreground italic">없음</span>}
              </p>
            </div>

            {/* 배경 */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-muted-foreground">배경</h5>

              {/* 배경설명 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">배경설명</span>
                  <div className="flex gap-1">
                    {!editingBgDesc ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onEditBgDescStart(cutKey, cut.background || '')}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          수정
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onGenerateBgDescription(storyboard.id, cutIndex)}
                          disabled={isGeneratingBgDesc}
                        >
                          {isGeneratingBgDesc ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              생성 중...
                            </>
                          ) : (
                            <>
                              <PenLine className="h-3 w-3 mr-1" />
                              AI 생성
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={async () => {
                            await onUpdateBgDescription(storyboard.id, cutIndex, editingBgDescValue);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          저장
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={onEditBgDescCancel}
                        >
                          취소
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {editingBgDesc ? (
                  <Textarea
                    value={editingBgDescValue}
                    onChange={(e) => onEditBgDescChange(e.target.value)}
                    className="min-h-[80px] text-sm"
                    placeholder="배경 설명을 입력하세요..."
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                    {cut.background || <span className="text-muted-foreground italic">없음</span>}
                  </p>
                )}
              </div>

              {/* 배경이미지 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">배경이미지</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => onGenerateBgImage(storyboard.id, cutIndex, cut)}
                    disabled={isGeneratingBgImage || !cut.background}
                  >
                    {isGeneratingBgImage ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      <>
                        <PenLine className="h-3 w-3 mr-1" />
                        배경 그리기
                      </>
                    )}
                  </Button>
                </div>
                {cutBackgroundImage ? (
                  <div className="relative">
                    <img
                      src={cutBackgroundImage}
                      alt="배경 이미지"
                      className="w-full max-h-[200px] object-contain rounded border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onViewImage(cutBackgroundImage, `컷 ${cut.cutNumber ?? cutIndex + 1} 배경`)}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded">
                    배경 이미지가 없습니다
                  </p>
                )}
              </div>

              {/* 관련배경 */}
              {Array.isArray(cut.relatedBackgrounds) && cut.relatedBackgrounds.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">관련배경:</span>
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    {cut.relatedBackgrounds.map((rb, idx) => (
                      <div key={idx} className="pl-2">
                        컷 {rb.cutNumber}: {rb.background.slice(0, 50)}
                        {rb.background.length > 50 ? '...' : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 연출/구도 */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-1">연출/구도</h5>
              <p className="text-sm whitespace-pre-wrap">
                {cut.description || <span className="text-muted-foreground italic">없음</span>}
              </p>
            </div>

            {/* 대사/내레이션 */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-1">대사/내레이션</h5>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {cut.dialogue || <span className="text-muted-foreground italic">없음</span>}
              </p>
            </div>

            {/* 등장인물 */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-1">등장인물</h5>
              <p className="text-sm text-muted-foreground">
                {Array.isArray(cut.charactersInCut) && cut.charactersInCut.length > 0
                  ? cut.charactersInCut.join(', ')
                  : <span className="text-muted-foreground italic">없음</span>}
              </p>
            </div>

            {/* 버튼 영역 */}
            <div className="mt-auto pt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditCut(storyboard.id, cutIndex, cut)}
                className="flex-1"
              >
                <Edit className="mr-2 h-4 w-4" />
                수정
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSplitCut(storyboard.id, cutIndex)}
                disabled={isSplitting}
                className="flex-1"
              >
                {isSplitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    분할 중...
                  </>
                ) : (
                  <>
                    <Scissors className="mr-2 h-4 w-4" />
                    분할
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDrawCut(storyboard.id, cutIndex, cut)}
                disabled={isDrawing}
                className="flex-1"
              >
                {isDrawing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <PenLine className="mr-2 h-4 w-4" />
                    콘티 그리기
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setYakontiExpanded(!yakontiExpanded)}
                className="flex-1"
              >
                <Flame className="mr-2 h-4 w-4 text-orange-500" />
                야콘티
                {yakontiExpanded ? (
                  <ChevronUp className="ml-1 h-3 w-3" />
                ) : (
                  <ChevronDown className="ml-1 h-3 w-3" />
                )}
              </Button>
            </div>

            {/* 야콘티 섹션 */}
            {yakontiExpanded && (
              <div className="mt-4 p-4 border rounded-lg bg-orange-50/50 dark:bg-orange-950/20 space-y-4">
                <h5 className="text-sm font-semibold flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  야콘티 이미지 생성
                </h5>

                {yakontiError && (
                  <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
                    {yakontiError}
                  </div>
                )}

                {/* 프롬프트 생성 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">이미지 프롬프트</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handleGenerateYakontiPrompt}
                      disabled={yakontiGeneratingPrompt || !cut.description}
                    >
                      {yakontiGeneratingPrompt ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          생성 중...
                        </>
                      ) : (
                        <>
                          <PenLine className="h-3 w-3 mr-1" />
                          프롬프트 생성
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={yakontiPrompt}
                    onChange={(e) => setYakontiPrompt(e.target.value)}
                    placeholder="프롬프트 생성 버튼을 클릭하거나 직접 입력하세요..."
                    className="min-h-[100px] text-sm"
                  />
                </div>

                {/* 레퍼런스 이미지 업로드 */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">레퍼런스 이미지</span>
                  <input
                    type="file"
                    ref={yakontiFileInputRef}
                    onChange={handleYakontiImageSelect}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => yakontiFileInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      이미지 선택
                    </Button>
                    {yakontiRefImage && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {yakontiRefImage.name}
                      </span>
                    )}
                  </div>
                  {yakontiRefImagePreview && (
                    <div className="mt-2">
                      <img
                        src={yakontiRefImagePreview}
                        alt="레퍼런스 이미지"
                        className="max-h-[150px] rounded border object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* 이미지 생성 버튼 */}
                <Button
                  onClick={handleGenerateYakontiImage}
                  disabled={yakontiGeneratingImage || !yakontiPrompt || !yakontiRefImage}
                  className="w-full"
                >
                  {yakontiGeneratingImage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      이미지 생성 중...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      야콘티 이미지 생성
                    </>
                  )}
                </Button>

                {/* 안내 메시지 */}
                <p className="text-xs text-muted-foreground text-center">
                  생성된 이미지는 우측 콘티 이미지 영역에 표시됩니다
                </p>
              </div>
            )}
          </div>

          {/* 오른쪽 패널: 이미지 */}
          <div className="flex items-center justify-center min-h-[200px] bg-muted/20 rounded border lg:col-span-1">
            {cutImage ? (
              <img
                src={cutImage}
                alt={cut.title || `cut-${cutIndex + 1}`}
                className="max-w-full max-h-[400px] rounded cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onViewImage(cutImage, cut.title || `컷 ${cut.cutNumber ?? cutIndex + 1}`)}
              />
            ) : isLoadingImage || isDrawing || yakontiGeneratingImage ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isDrawing ? '콘티 이미지 생성 중...' : yakontiGeneratingImage ? '야콘티 이미지 생성 중...' : '이미지 불러오는 중...'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                콘티 이미지가 생성되면 여기에 표시됩니다.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
