'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Plus, X, Loader2, Download, Sparkles, Shirt, Package, Save,
  RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { CharacterWithSheets, CharacterSheet } from '@/lib/supabase';
import { useComposeCharacterSheet } from '@/hooks/useComposeCharacterSheet';
import type { ReferenceImage } from '@/lib/types/compose';

interface RefImage extends ReferenceImage {
  id: string;        // 클라이언트 임시 ID
  previewUrl: string; // 미리보기용 data URL
}

interface CharacterComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: CharacterWithSheets;
}

// 이미지 파일 → RefImage 변환
async function fileToRefImage(file: File): Promise<RefImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const [header, base64] = dataUrl.split(',');
      const mimeMatch = header.match(/^data:(.*);base64$/);
      const mimeType = mimeMatch?.[1] || file.type || 'image/png';
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        base64,
        mimeType,
        previewUrl: dataUrl,
        instruction: '',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 상태 텍스트
function StatusText({ status, queuePosition }: { status: string; queuePosition: number | null }) {
  if (status === 'submitting') return <span>요청 전송 중...</span>;
  if (status === 'queued') {
    return (
      <span>
        큐 대기 중{queuePosition != null ? ` (${queuePosition + 1}번째)` : ''}
        <span className="text-xs text-muted-foreground ml-2">약 2~4분 소요</span>
      </span>
    );
  }
  if (status === 'processing') return <span>이미지 생성 중...</span>;
  return null;
}

export function CharacterComposerDialog({
  open,
  onOpenChange,
  character,
}: CharacterComposerDialogProps) {
  const sheets = character.character_sheets || [];

  // 베이스 시트
  const [baseSheet, setBaseSheet] = useState<CharacterSheet | null>(sheets[0] ?? null);

  // 레퍼런스 이미지 목록
  const [outfitImages, setOutfitImages] = useState<RefImage[]>([]);
  const [propImages, setPropImages] = useState<RefImage[]>([]);

  // 전체 추가 지시
  const [globalInstruction, setGlobalInstruction] = useState('');

  // 수정 지시
  const [refineInstruction, setRefineInstruction] = useState('');

  // 저장 상태
  const [saving, setSaving] = useState(false);

  // 드래그 상태
  const [draggingOver, setDraggingOver] = useState<'outfit' | 'prop' | null>(null);

  // 파일 입력 ref
  const outfitFileRef = useRef<HTMLInputElement>(null);
  const propFileRef = useRef<HTMLInputElement>(null);

  const { status, resultImage, error, queuePosition, isLoading, compose, refine, reset, _isMountedRef } =
    useComposeCharacterSheet();

  // 다이얼로그가 닫힐 때 초기화
  useEffect(() => {
    if (!open) {
      reset();
      setOutfitImages([]);
      setPropImages([]);
      setGlobalInstruction('');
      setRefineInstruction('');
      setSaving(false);
      setBaseSheet(sheets[0] ?? null);
    } else {
      _isMountedRef.current = true;
    }
    return () => {
      _isMountedRef.current = false;
    };
  }, [open]);

  // 파일 추가
  const addFiles = useCallback(async (files: FileList | null, slot: 'outfit' | 'prop') => {
    if (!files || files.length === 0) return;
    const newImages = await Promise.all(
      Array.from(files)
        .filter(f => f.type.startsWith('image/'))
        .map(fileToRefImage)
    );
    if (slot === 'outfit') {
      setOutfitImages(prev => {
        const remaining = Math.max(0, 5 - prev.length - propImages.length);
        return [...prev, ...newImages.slice(0, remaining)];
      });
    } else {
      setPropImages(prev => {
        const remaining = Math.max(0, 5 - outfitImages.length - prev.length);
        return [...prev, ...newImages.slice(0, remaining)];
      });
    }
  }, [outfitImages.length, propImages.length]);

  const removeOutfit = (id: string) => setOutfitImages(prev => prev.filter(i => i.id !== id));
  const removeProp = (id: string) => setPropImages(prev => prev.filter(i => i.id !== id));

  const updateOutfitInstruction = (id: string, value: string) =>
    setOutfitImages(prev => prev.map(i => i.id === id ? { ...i, instruction: value } : i));
  const updatePropInstruction = (id: string, value: string) =>
    setPropImages(prev => prev.map(i => i.id === id ? { ...i, instruction: value } : i));

  // 드래그앤드롭
  const handleDrop = async (e: React.DragEvent, slot: 'outfit' | 'prop') => {
    e.preventDefault();
    setDraggingOver(null);
    await addFiles(e.dataTransfer.files, slot);
  };

  // 생성
  const handleCompose = async () => {
    if (!baseSheet) return;
    await compose({
      baseSheetUrl: baseSheet.file_path,
      outfitImages: outfitImages.map(({ base64, mimeType, instruction }) => ({ base64, mimeType, instruction })),
      propImages: propImages.map(({ base64, mimeType, instruction }) => ({ base64, mimeType, instruction })),
      globalInstruction: globalInstruction.trim() || undefined,
    });
  };

  // 부분 수정
  const handleRefine = async () => {
    if (!resultImage || !refineInstruction.trim()) return;
    await refine({
      previousImageBase64: resultImage.base64,
      previousImageMimeType: resultImage.mimeType,
      refinementInstruction: refineInstruction.trim(),
    });
    setRefineInstruction('');
  };

  // 저장
  const handleSave = async () => {
    if (!resultImage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/characters/${character.id}/save-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: resultImage.base64,
          mimeType: resultImage.mimeType,
          fileName: `${character.name}-composed`,
          description: '캐릭터 컴포저로 생성',
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      alert('캐릭터 시트로 저장되었습니다.');
      onOpenChange(false);
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const totalRefs = outfitImages.length + propImages.length;
  const canCompose = !!baseSheet && totalRefs > 0 && !isLoading;
  const canRefine = !!resultImage && !!refineInstruction.trim() && !isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[96vw] w-[96vw] h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            {character.name} — 캐릭터시트 컴포저
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── 좌측 입력 패널 ─────────────────────── */}
          <div className="w-[340px] flex-shrink-0 flex flex-col border-r">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-5">

                {/* 베이스 캐릭터시트 선택 */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    베이스 캐릭터시트
                  </h3>
                  {sheets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">등록된 시트가 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {sheets.map(sheet => (
                        <button
                          key={sheet.id}
                          onClick={() => setBaseSheet(sheet)}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video ${
                            baseSheet?.id === sheet.id
                              ? 'border-primary shadow-md'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          <img
                            src={sheet.file_path}
                            alt={sheet.file_name}
                            className="w-full h-full object-cover"
                          />
                          {baseSheet?.id === sheet.id && (
                            <div className="absolute inset-0 bg-primary/15 flex items-center justify-center">
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <span className="text-primary-foreground text-xs">✓</span>
                              </div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* 의상 슬롯 */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Shirt className="h-3.5 w-3.5" />
                      의상 레퍼런스
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => outfitFileRef.current?.click()}
                      disabled={totalRefs >= 5}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      추가
                    </Button>
                  </div>
                  <input
                    ref={outfitFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => addFiles(e.target.files, 'outfit')}
                  />

                  {/* 드롭존 */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDraggingOver('outfit'); }}
                    onDragLeave={() => setDraggingOver(null)}
                    onDrop={e => handleDrop(e, 'outfit')}
                    onClick={() => outfitImages.length === 0 && outfitFileRef.current?.click()}
                    className={`rounded-lg border-2 border-dashed p-3 transition-colors ${
                      draggingOver === 'outfit'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    } ${outfitImages.length === 0 ? 'cursor-pointer hover:border-muted-foreground' : ''}`}
                  >
                    {outfitImages.length === 0 ? (
                      <p className="text-xs text-center text-muted-foreground py-2">
                        클릭 또는 드래그하여 의상 이미지 추가
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {outfitImages.map(img => (
                          <RefImageRow
                            key={img.id}
                            image={img}
                            onRemove={() => removeOutfit(img.id)}
                            onInstructionChange={v => updateOutfitInstruction(img.id, v)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* 소품 슬롯 */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      소품 레퍼런스
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => propFileRef.current?.click()}
                      disabled={totalRefs >= 5}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      추가
                    </Button>
                  </div>
                  <input
                    ref={propFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => addFiles(e.target.files, 'prop')}
                  />

                  <div
                    onDragOver={e => { e.preventDefault(); setDraggingOver('prop'); }}
                    onDragLeave={() => setDraggingOver(null)}
                    onDrop={e => handleDrop(e, 'prop')}
                    onClick={() => propImages.length === 0 && propFileRef.current?.click()}
                    className={`rounded-lg border-2 border-dashed p-3 transition-colors ${
                      draggingOver === 'prop'
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    } ${propImages.length === 0 ? 'cursor-pointer hover:border-muted-foreground' : ''}`}
                  >
                    {propImages.length === 0 ? (
                      <p className="text-xs text-center text-muted-foreground py-2">
                        클릭 또는 드래그하여 소품 이미지 추가
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {propImages.map(img => (
                          <RefImageRow
                            key={img.id}
                            image={img}
                            onRemove={() => removeProp(img.id)}
                            onInstructionChange={v => updatePropInstruction(img.id, v)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* 추가 지시 */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    추가 지시 (선택)
                  </h3>
                  <Textarea
                    value={globalInstruction}
                    onChange={e => setGlobalInstruction(e.target.value)}
                    placeholder="예: 전체적으로 어두운 톤 유지, 망토는 검정색으로"
                    rows={3}
                    className="text-sm resize-none"
                  />
                </section>

                {totalRefs >= 5 && (
                  <p className="text-xs text-amber-600">레퍼런스 이미지는 최대 5개까지 가능합니다.</p>
                )}
              </div>
            </ScrollArea>

            {/* 생성 버튼 */}
            <div className="p-4 border-t flex-shrink-0">
              <Button
                onClick={handleCompose}
                disabled={!canCompose}
                className="w-full gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <StatusText status={status} queuePosition={queuePosition} />
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    캐릭터시트 생성
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ── 우측 결과 패널 ─────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-auto p-5">
              {status === 'failed' && error && (
                <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {resultImage ? (
                <div className="space-y-4">
                  <img
                    src={`data:${resultImage.mimeType};base64,${resultImage.base64}`}
                    alt="생성 결과"
                    className="w-full rounded-xl border shadow-sm"
                  />
                  {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <StatusText status={status} queuePosition={queuePosition} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-xl border-2 border-dashed border-border text-muted-foreground">
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
                      <div className="text-sm font-medium">
                        <StatusText status={status} queuePosition={queuePosition} />
                      </div>
                      <p className="text-xs text-muted-foreground/70">약 2~4분 소요됩니다</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Sparkles className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm">왼쪽에서 요소를 추가하고 생성 버튼을 눌러주세요.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 하단 액션 */}
            {resultImage && (
              <div className="flex-shrink-0 border-t p-4 space-y-3">
                {/* 부분 수정 */}
                <div className="flex gap-2">
                  <Input
                    value={refineInstruction}
                    onChange={e => setRefineInstruction(e.target.value)}
                    placeholder="수정 지시 예: 숄의 톤을 더 빼줘, 초커 체인 제거"
                    className="flex-1 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter' && canRefine) handleRefine(); }}
                    disabled={isLoading}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefine}
                    disabled={!canRefine}
                    className="shrink-0 gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    수정
                  </Button>
                </div>

                {/* 새로 생성 + 저장 */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCompose}
                    disabled={!canCompose}
                    className="flex-1 gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    새로 생성
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || isLoading}
                    className="flex-1 gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    캐릭터시트로 저장
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 레퍼런스 이미지 행 컴포넌트
function RefImageRow({
  image,
  onRemove,
  onInstructionChange,
}: {
  image: RefImage;
  onRemove: () => void;
  onInstructionChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <img
          src={image.previewUrl}
          alt="reference"
          className="w-12 h-12 object-cover rounded flex-shrink-0 border"
        />
        <div className="flex-1 min-w-0">
          <Input
            value={image.instruction || ''}
            onChange={e => onInstructionChange(e.target.value)}
            placeholder="지시 예: 검정 가죽 자켓"
            className="h-7 text-xs border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-2 pb-2">
          <img
            src={image.previewUrl}
            alt="reference preview"
            className="w-full rounded border object-contain max-h-40"
          />
        </div>
      )}
    </div>
  );
}
