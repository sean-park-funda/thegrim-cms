'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Plus, Sparkles, Loader2, X, Check, Shirt, Package,
  Pencil, Trash2, Upload, RefreshCw, Save, ImageIcon, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CharacterWithSheets, CharacterSheet } from '@/lib/supabase';
import { getCharactersByWebtoon } from '@/lib/api/characters';
import { ReferenceItem, getReferenceItems, uploadReferenceItem, deleteReferenceItem, modifyReferenceItem } from '@/lib/api/referenceItems';
import { useComposeCharacterSheet } from '@/hooks/useComposeCharacterSheet';
import { useStore } from '@/lib/store/useStore';

// ─── 타입 ─────────────────────────────────────
interface EquippedItem {
  item: ReferenceItem;
  instruction: string;
}

// ─── 상태 텍스트 ───────────────────────────────
function StatusLabel({ status, queuePosition }: { status: string; queuePosition: number | null }) {
  if (status === 'submitting') return <>요청 전송 중...</>;
  if (status === 'queued') return <>큐 대기{queuePosition != null ? ` (${queuePosition + 1}번째)` : ''}…</>;
  if (status === 'processing') return <>이미지 생성 중…</>;
  return null;
}

export default function ComposerPage() {
  const params = useParams();
  const router = useRouter();
  const webtoonId = params.webtoonId as string;
  const { profile } = useStore();

  // ─── 캐릭터 / 시트 ────────────────────────────
  const [characters, setCharacters] = useState<CharacterWithSheets[]>([]);
  const [selectedChar, setSelectedChar] = useState<CharacterWithSheets | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<CharacterSheet | null>(null);
  const [loadingChars, setLoadingChars] = useState(true);

  // ─── 레퍼런스 아이템 리포지터리 ───────────────
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'outfit' | 'prop'>('outfit');
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── 장착된 아이템 ─────────────────────────────
  const [equipped, setEquipped] = useState<EquippedItem[]>([]);
  const [globalInstruction, setGlobalInstruction] = useState('');

  // ─── 업로드 다이얼로그 ─────────────────────────
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; type: 'outfit' | 'prop' }>({ open: false, type: 'outfit' });
  const [uploadFile, setUploadFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // ─── 아이템 수정 다이얼로그 ───────────────────
  const [modifyDialog, setModifyDialog] = useState<{ open: boolean; item: ReferenceItem | null }>({ open: false, item: null });
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifyName, setModifyName] = useState('');
  const [modifying, setModifying] = useState(false);

  // ─── 생성/수정 훅 ─────────────────────────────
  const { status, resultImage, error, queuePosition, isLoading, compose, refine, reset, _isMountedRef } =
    useComposeCharacterSheet();

  // ─── 결과 패널 ────────────────────────────────
  const [refineInstruction, setRefineInstruction] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── 데이터 로드 ──────────────────────────────
  useEffect(() => {
    _isMountedRef.current = true;
    return () => { _isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!webtoonId) return;
    setLoadingChars(true);
    getCharactersByWebtoon(webtoonId)
      .then(data => {
        setCharacters(data);
        if (data.length > 0) {
          setSelectedChar(data[0]);
          const firstSheet = data[0].character_sheets?.[0] ?? null;
          setSelectedSheet(firstSheet);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingChars(false));
  }, [webtoonId]);

  const loadItems = useCallback(async () => {
    if (!webtoonId) return;
    setLoadingItems(true);
    try {
      const data = await getReferenceItems(webtoonId);
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingItems(false);
    }
  }, [webtoonId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ─── 캐릭터 변경 ──────────────────────────────
  const handleSelectChar = (char: CharacterWithSheets) => {
    setSelectedChar(char);
    setSelectedSheet(char.character_sheets?.[0] ?? null);
    reset();
  };

  // ─── 아이템 장착/해제 ─────────────────────────
  const toggleEquip = (item: ReferenceItem) => {
    setEquipped(prev => {
      const exists = prev.find(e => e.item.id === item.id);
      if (exists) return prev.filter(e => e.item.id !== item.id);
      if (prev.length >= 5) {
        alert('레퍼런스는 최대 5개까지 장착 가능합니다.');
        return prev;
      }
      return [...prev, { item, instruction: '' }];
    });
  };

  const isEquipped = (itemId: string) => equipped.some(e => e.item.id === itemId);

  const updateInstruction = (itemId: string, value: string) =>
    setEquipped(prev => prev.map(e => e.item.id === itemId ? { ...e, instruction: value } : e));

  const unequip = (itemId: string) => setEquipped(prev => prev.filter(e => e.item.id !== itemId));

  // ─── 생성 ──────────────────────────────────────
  const handleCompose = async () => {
    if (!selectedSheet) return;
    const outfitImages = equipped
      .filter(e => e.item.type === 'outfit')
      .map(e => ({ base64: '', mimeType: 'image/png', instruction: e.instruction || e.item.name, _url: e.item.file_path }));
    const propImages = equipped
      .filter(e => e.item.type === 'prop')
      .map(e => ({ base64: '', mimeType: 'image/png', instruction: e.instruction || e.item.name, _url: e.item.file_path }));

    // URL을 base64로 변환
    const toBase64 = async (url: string) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      return { base64: Buffer.from(buf).toString('base64'), mimeType: res.headers.get('content-type') || 'image/png' };
    };

    const outfitConverted = await Promise.all(outfitImages.map(async img => {
      const { base64, mimeType } = await toBase64(img._url);
      return { base64, mimeType, instruction: img.instruction };
    }));
    const propConverted = await Promise.all(propImages.map(async img => {
      const { base64, mimeType } = await toBase64(img._url);
      return { base64, mimeType, instruction: img.instruction };
    }));

    await compose({
      baseSheetUrl: selectedSheet.file_path,
      outfitImages: outfitConverted,
      propImages: propConverted,
      globalInstruction: globalInstruction.trim() || undefined,
    });
  };

  const handleRefine = async () => {
    if (!resultImage || !refineInstruction.trim()) return;
    await refine({
      previousImageBase64: resultImage.base64,
      previousImageMimeType: resultImage.mimeType,
      refinementInstruction: refineInstruction.trim(),
    });
    setRefineInstruction('');
  };

  const handleSave = async () => {
    if (!resultImage || !selectedChar) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/characters/${selectedChar.id}/save-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: resultImage.base64,
          mimeType: resultImage.mimeType,
          fileName: `${selectedChar.name}-composed`,
          description: '드레스업 컴포저로 생성',
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      alert('캐릭터 시트로 저장되었습니다.');
      reset();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ─── 아이템 업로드 ────────────────────────────
  const handleUploadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploadFile({ file, previewUrl: URL.createObjectURL(file) });
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile || !uploadName.trim()) return;
    setUploading(true);
    try {
      const item = await uploadReferenceItem(webtoonId, uploadFile.file, uploadDialog.type, uploadName.trim());
      setItems(prev => [item, ...prev]);
      setUploadDialog({ open: false, type: 'outfit' });
      setUploadFile(null);
      setUploadName('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  // ─── 아이템 수정본 생성 ───────────────────────
  const handleModifySubmit = async () => {
    if (!modifyDialog.item || !modifyInstruction.trim()) return;
    setModifying(true);
    try {
      const { requestId, parentItem, newName: suggestedName } = await modifyReferenceItem(
        webtoonId,
        modifyDialog.item.id,
        modifyInstruction.trim(),
        modifyName.trim() || undefined
      );

      // 폴링해서 결과 저장 (별도 처리: 완료 후 리포지터리에 추가)
      alert('수정본을 생성 중입니다. 완료되면 자동으로 저장됩니다.');
      setModifyDialog({ open: false, item: null });
      setModifyInstruction('');
      setModifyName('');

      // 백그라운드 폴링
      pollModifyResult(requestId, parentItem, modifyName.trim() || suggestedName);
    } catch (e) {
      alert(e instanceof Error ? e.message : '수정 요청 실패');
    } finally {
      setModifying(false);
    }
  };

  const pollModifyResult = async (requestId: string, parentItem: ReferenceItem, newName: string) => {
    const FAL_BASE = 'https://queue.fal.run/fal-ai/openai/gpt-image-2';
    let attempts = 0;
    while (attempts < 36) {
      await new Promise(r => setTimeout(r, 10000));
      attempts++;
      try {
        const statusRes = await fetch(`/api/compose-character-sheet/status?requestId=${requestId}`);
        const data = await statusRes.json();
        if (data.status === 'COMPLETED') {
          // 결과를 새 reference_item으로 저장
          const res = await fetch(`/api/webtoons/${webtoonId}/reference-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageData: data.imageData,
              mimeType: data.mimeType,
              type: parentItem.type,
              name: newName,
              parentId: parentItem.id,
            }),
          });
          if (res.ok) {
            const newItem = await res.json();
            setItems(prev => [newItem, ...prev]);
            alert(`"${newName}" 수정본이 리포지터리에 추가되었습니다.`);
          }
          return;
        }
        if (data.status === 'FAILED') {
          alert('수정본 생성에 실패했습니다.');
          return;
        }
      } catch { /* continue */ }
    }
    alert('수정본 생성 시간이 초과되었습니다.');
  };

  // ─── 아이템 삭제 ──────────────────────────────
  const handleDeleteItem = async (item: ReferenceItem) => {
    if (!confirm(`"${item.name}"을(를) 삭제하시겠습니까?`)) return;
    try {
      await deleteReferenceItem(webtoonId, item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      setEquipped(prev => prev.filter(e => e.item.id !== item.id));
    } catch {
      alert('삭제 실패');
    }
  };

  // ─── 필터링된 아이템 ──────────────────────────
  const filteredItems = items.filter(i => {
    if (i.type !== activeTab) return false;
    if (!searchQuery.trim()) return true;
    return i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (i.description || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const canCompose = !!selectedSheet && equipped.length > 0 && !isLoading;

  // ─── 렌더 ─────────────────────────────────────
  if (loadingChars) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-background">
      {/* ── 상단 헤더 ─────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b bg-card">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </Button>

        <div className="h-5 w-px bg-border" />

        <span className="text-sm font-semibold">캐릭터 드레스업</span>

        {/* 캐릭터 선택 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-8">
              {selectedChar ? (
                <>
                  {selectedChar.character_sheets?.[0] && (
                    <img src={selectedChar.character_sheets[0].file_path} className="w-5 h-5 rounded-full object-cover" alt="" />
                  )}
                  {selectedChar.name}
                </>
              ) : '캐릭터 선택'}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {characters.map(char => (
              <DropdownMenuItem
                key={char.id}
                onClick={() => handleSelectChar(char)}
                className="gap-2"
              >
                {char.character_sheets?.[0] && (
                  <img src={char.character_sheets[0].file_path} className="w-6 h-6 rounded-full object-cover" alt="" />
                )}
                {char.name}
                {selectedChar?.id === char.id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 베이스 시트 선택 */}
        {selectedChar && (selectedChar.character_sheets?.length ?? 0) > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8">
                베이스 시트
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {selectedChar.character_sheets!.map(sheet => (
                <DropdownMenuItem
                  key={sheet.id}
                  onClick={() => setSelectedSheet(sheet)}
                  className="gap-2"
                >
                  <img src={sheet.file_path} className="w-8 h-5 object-cover rounded" alt="" />
                  <span className="truncate max-w-[140px] text-xs">{sheet.file_name}</span>
                  {selectedSheet?.id === sheet.id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />

        {/* 생성 버튼 */}
        <Button
          onClick={handleCompose}
          disabled={!canCompose}
          size="sm"
          className="gap-2 h-8 px-4"
        >
          {isLoading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /><StatusLabel status={status} queuePosition={queuePosition} /></>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" />생성하기</>
          )}
        </Button>
      </div>

      {/* ── 메인 영역 ─────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ── 왼쪽: 캐릭터 스테이지 ─────────────── */}
        <div className="w-[360px] flex-shrink-0 flex flex-col border-r bg-muted/20">
          {/* 캐릭터시트 미리보기 */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            {selectedSheet ? (
              <img
                src={selectedSheet.file_path}
                alt="base character sheet"
                className="max-w-full max-h-full object-contain rounded-xl shadow-md"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-12 w-12 opacity-30" />
                <p className="text-sm">캐릭터 시트를 선택하세요</p>
              </div>
            )}
          </div>

          {/* 장착된 아이템 + 지시 */}
          <div className="flex-shrink-0 border-t p-3 space-y-2 bg-card">
            {equipped.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-2">
                오른쪽에서 의상/소품을 선택하세요
              </p>
            ) : (
              <div className="space-y-1.5">
                {equipped.map(({ item, instruction }) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5">
                    <img src={item.file_path} className="w-8 h-8 rounded object-cover flex-shrink-0" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] px-1 py-0.5 rounded ${item.type === 'outfit' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.type === 'outfit' ? '의상' : '소품'}
                        </span>
                        <span className="text-xs font-medium truncate">{item.name}</span>
                      </div>
                      <Input
                        value={instruction}
                        onChange={e => updateInstruction(item.id, e.target.value)}
                        placeholder="지시 (예: 검정으로 변경)"
                        className="h-6 text-xs mt-1 bg-background border-0 px-1 focus-visible:ring-0"
                      />
                    </div>
                    <button onClick={() => unequip(item.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Input
              value={globalInstruction}
              onChange={e => setGlobalInstruction(e.target.value)}
              placeholder="전체 추가 지시 (예: 전체 톤을 어둡게)"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* ── 가운데: 리포지터리 ─────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* 탭 + 검색 + 업로드 */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b bg-card">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setActiveTab('outfit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${activeTab === 'outfit' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                <Shirt className="h-3.5 w-3.5" />
                의상
                <span className="text-xs opacity-70">({items.filter(i => i.type === 'outfit').length})</span>
              </button>
              <button
                onClick={() => setActiveTab('prop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${activeTab === 'prop' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                <Package className="h-3.5 w-3.5" />
                소품
                <span className="text-xs opacity-70">({items.filter(i => i.type === 'prop').length})</span>
              </button>
            </div>

            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="검색..."
              className="h-8 w-48 text-sm"
            />

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setUploadDialog({ open: true, type: activeTab })}
            >
              <Plus className="h-3.5 w-3.5" />
              {activeTab === 'outfit' ? '의상' : '소품'} 추가
            </Button>
          </div>

          {/* 아이템 그리드 */}
          <ScrollArea className="flex-1">
            <div className="p-3">
              {loadingItems ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  {activeTab === 'outfit' ? <Shirt className="h-10 w-10 opacity-20 mb-2" /> : <Package className="h-10 w-10 opacity-20 mb-2" />}
                  <p className="text-sm">아이템이 없습니다</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => setUploadDialog({ open: true, type: activeTab })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    첫 번째 {activeTab === 'outfit' ? '의상' : '소품'} 추가
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                  {filteredItems.map(item => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      equipped={isEquipped(item.id)}
                      onToggle={() => toggleEquip(item)}
                      onModify={() => {
                        setModifyDialog({ open: true, item });
                        setModifyInstruction('');
                        setModifyName(`${item.name} (수정본)`);
                      }}
                      onDelete={() => handleDeleteItem(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── 오른쪽: 생성 결과 ──────────────────── */}
        {(resultImage || isLoading || error) && (
          <div className="w-[380px] flex-shrink-0 flex flex-col border-l bg-card">
            <div className="flex-shrink-0 px-4 py-2 border-b flex items-center justify-between">
              <span className="text-sm font-medium">생성 결과</span>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {resultImage ? (
                <img
                  src={`data:${resultImage.mimeType};base64,${resultImage.base64}`}
                  alt="결과"
                  className="w-full rounded-xl border shadow-sm"
                />
              ) : isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                  <div className="text-sm"><StatusLabel status={status} queuePosition={queuePosition} /></div>
                  <p className="text-xs opacity-60">약 2~4분 소요됩니다</p>
                </div>
              ) : null}

              {isLoading && resultImage && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <StatusLabel status={status} queuePosition={queuePosition} />
                </div>
              )}
            </div>

            {resultImage && (
              <div className="flex-shrink-0 border-t p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={refineInstruction}
                    onChange={e => setRefineInstruction(e.target.value)}
                    placeholder="수정 지시 (예: 숄 색상을 더 진하게)"
                    className="flex-1 text-xs h-8"
                    onKeyDown={e => { if (e.key === 'Enter' && refineInstruction.trim() && !isLoading) handleRefine(); }}
                    disabled={isLoading}
                  />
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleRefine}
                    disabled={!refineInstruction.trim() || isLoading}>
                    <RefreshCw className="h-3 w-3" />
                    수정
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-8 gap-1" onClick={handleCompose} disabled={!canCompose}>
                    <Sparkles className="h-3 w-3" />
                    재생성
                  </Button>
                  <Button size="sm" className="flex-1 h-8 gap-1" onClick={handleSave} disabled={saving || isLoading}>
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    시트로 저장
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 업로드 다이얼로그 ─────────────────── */}
      <Dialog open={uploadDialog.open} onOpenChange={o => { if (!o) { setUploadDialog(p => ({ ...p, open: false })); setUploadFile(null); setUploadName(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{uploadDialog.type === 'outfit' ? '의상' : '소품'} 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 드롭존 */}
            <div
              className="border-2 border-dashed rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => uploadFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUploadFile(f); }}
            >
              {uploadFile ? (
                <img src={uploadFile.previewUrl} className="w-full max-h-48 object-contain" alt="preview" />
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <Upload className="h-8 w-8 opacity-40" />
                  <p className="text-sm">클릭하거나 드래그하여 이미지 선택</p>
                </div>
              )}
            </div>
            <input ref={uploadFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />

            <Input
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              placeholder="이름 (예: 군복 상의, 가죽 초커)"
            />

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUploadDialog(p => ({ ...p, open: false }))}>취소</Button>
              <Button onClick={handleUploadSubmit} disabled={!uploadFile || !uploadName.trim() || uploading} className="gap-1.5">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 수정본 생성 다이얼로그 ────────────── */}
      <Dialog open={modifyDialog.open} onOpenChange={o => setModifyDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>수정본 만들기</DialogTitle>
          </DialogHeader>
          {modifyDialog.item && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img src={modifyDialog.item.file_path} className="w-16 h-16 rounded-lg object-cover border" alt="" />
                <div>
                  <p className="font-medium text-sm">{modifyDialog.item.name}</p>
                  <p className="text-xs text-muted-foreground">원본 기반으로 수정본을 생성합니다</p>
                </div>
              </div>
              <Textarea
                value={modifyInstruction}
                onChange={e => setModifyInstruction(e.target.value)}
                placeholder="수정 지시 (예: 색상을 검정으로 변경, 핏을 더 타이트하게, 소매를 제거)"
                rows={3}
              />
              <Input
                value={modifyName}
                onChange={e => setModifyName(e.target.value)}
                placeholder="수정본 이름"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setModifyDialog({ open: false, item: null })}>취소</Button>
                <Button onClick={handleModifySubmit}
                  disabled={!modifyInstruction.trim() || modifying}
                  className="gap-1.5">
                  {modifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  수정본 생성
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 아이템 카드 컴포넌트 ─────────────────────────────
function ItemCard({
  item, equipped, onToggle, onModify, onDelete,
}: {
  item: ReferenceItem;
  equipped: boolean;
  onToggle: () => void;
  onModify: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-150 ${
        equipped ? 'border-primary shadow-md shadow-primary/20' : 'border-border hover:border-primary/40'
      }`}
      onClick={onToggle}
    >
      {/* 이미지 */}
      <div className="aspect-square bg-muted">
        <img src={item.file_path} alt={item.name} className="w-full h-full object-cover" />
      </div>

      {/* 장착 뱃지 */}
      {equipped && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}

      {/* 수정/삭제 버튼 — 호버 시 */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onModify(); }}
          className="w-5 h-5 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background"
          title="수정본 만들기"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-5 h-5 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-destructive hover:text-white"
          title="삭제"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* 이름 */}
      <div className="px-1.5 py-1 bg-card">
        <p className="text-[11px] text-center truncate">{item.name}</p>
        {item.parent_id && (
          <p className="text-[9px] text-center text-muted-foreground">수정본</p>
        )}
      </div>
    </div>
  );
}
