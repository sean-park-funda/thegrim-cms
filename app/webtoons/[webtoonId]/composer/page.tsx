'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Plus, Sparkles, Loader2, X, Check, Shirt, Package,
  Pencil, Trash2, Upload, RefreshCw, Save, ImageIcon, Wand2,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CharacterWithSheets, CharacterSheet } from '@/lib/supabase';
import { getCharactersByWebtoon } from '@/lib/api/characters';
import { ReferenceItem, getReferenceItems, uploadReferenceItem, deleteReferenceItem, modifyReferenceItem, createReferenceItemFromRefs } from '@/lib/api/referenceItems';
import { useComposeCharacterSheet } from '@/hooks/useComposeCharacterSheet';
import { useStore } from '@/lib/store/useStore';

interface EquippedItem {
  item: ReferenceItem;
  instruction: string;
}

function StatusLabel({ status }: { status: string }) {
  if (status === 'submitting') return <>이미지 생성 중… (최대 2분)</>;
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
  const [charFilter, setCharFilter] = useState<string>('all');

  // ─── 레퍼런스 아이템 리포지터리 ───────────────
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [outfitSearch, setOutfitSearch] = useState('');
  const [propSearch, setPropSearch] = useState('');

  // ─── 선택된 아이템 (멀티셀렉트) ──────────────
  const [equipped, setEquipped] = useState<EquippedItem[]>([]);
  const [globalInstruction, setGlobalInstruction] = useState('');

  // ─── 업로드 다이얼로그 ─────────────────────────
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; type: 'outfit' | 'prop' }>({ open: false, type: 'outfit' });
  const [uploadMode, setUploadMode] = useState<'direct' | 'generate'>('direct');
  const [uploadFile, setUploadFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  // 생성형 추가
  const [genRefFile, setGenRefFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [genInstruction, setGenInstruction] = useState('');
  const [genName, setGenName] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<{ base64: string; mimeType: string } | null>(null);
  const genRefFileRef = useRef<HTMLInputElement>(null);

  // ─── 아이템 수정 다이얼로그 ───────────────────
  const [modifyDialog, setModifyDialog] = useState<{ open: boolean; item: ReferenceItem | null }>({ open: false, item: null });
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifyName, setModifyName] = useState('');
  const [modifying, setModifying] = useState(false);

  // ─── 레퍼런스로 새 요소 만들기 ───────────────
  const [createFromRefsDialog, setCreateFromRefsDialog] = useState(false);
  const [cfrSelectedIds, setCfrSelectedIds] = useState<Set<string>>(new Set());
  const [cfrInstruction, setCfrInstruction] = useState('');
  const [cfrName, setCfrName] = useState('');
  const [cfrType, setCfrType] = useState<'outfit' | 'prop'>('outfit');
  const [cfrLoading, setCfrLoading] = useState(false);

  // ─── 생성/수정 훅 ─────────────────────────────
  const { status, resultImage, error, isLoading, compose, refine, reset, _isMountedRef } =
    useComposeCharacterSheet();

  // ─── 결과 패널 ────────────────────────────────
  const [refineInstruction, setRefineInstruction] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── 마운트 ───────────────────────────────────
  useEffect(() => {
    _isMountedRef.current = true;
    return () => { _isMountedRef.current = false; };
  }, []);

  // ─── 캐릭터 로드 ──────────────────────────────
  useEffect(() => {
    if (!webtoonId) return;
    setLoadingChars(true);
    getCharactersByWebtoon(webtoonId)
      .then(data => {
        setCharacters(data);
        if (data.length > 0) {
          setSelectedChar(data[0]);
          setSelectedSheet(data[0].character_sheets?.[0] ?? null);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingChars(false));
  }, [webtoonId]);

  // ─── 아이템 로드 ──────────────────────────────
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

  // ─── 캐릭터 선택 ──────────────────────────────
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
        alert('레퍼런스는 최대 5개까지 선택 가능합니다.');
        return prev;
      }
      return [...prev, { item, instruction: '' }];
    });
  };

  const isEquipped = (itemId: string) => equipped.some(e => e.item.id === itemId);

  const unequip = (itemId: string) => setEquipped(prev => prev.filter(e => e.item.id !== itemId));

  const updateInstruction = (itemId: string, value: string) =>
    setEquipped(prev => prev.map(e => e.item.id === itemId ? { ...e, instruction: value } : e));

  // ─── 생성 ─────────────────────────────────────
  const handleCompose = async () => {
    if (!selectedSheet) return;
    const toBase64 = async (url: string) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      return { base64: Buffer.from(buf).toString('base64'), mimeType: res.headers.get('content-type') || 'image/png' };
    };

    const outfitConverted = await Promise.all(
      equipped.filter(e => e.item.type === 'outfit').map(async e => {
        const { base64, mimeType } = await toBase64(e.item.file_path);
        return { base64, mimeType, instruction: e.instruction || e.item.name };
      })
    );
    const propConverted = await Promise.all(
      equipped.filter(e => e.item.type === 'prop').map(async e => {
        const { base64, mimeType } = await toBase64(e.item.file_path);
        return { base64, mimeType, instruction: e.instruction || e.item.name };
      })
    );

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

  // ─── 업로드 ───────────────────────────────────
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

  // ─── 다이얼로그 닫기 리셋 ─────────────────────
  const closeUploadDialog = () => {
    setUploadDialog(p => ({ ...p, open: false }));
    setUploadFile(null);
    setUploadName('');
    setUploadMode('direct');
    setGenRefFile(null);
    setGenInstruction('');
    setGenName('');
    setGenResult(null);
  };

  // ─── 생성형 추가: 레퍼런스 → 만화체 변환 ───────
  const handleGenRefFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setGenRefFile({ file, previewUrl: URL.createObjectURL(file) });
    if (!genName) setGenName(file.name.replace(/\.[^.]+$/, ''));
    setGenResult(null);
  };

  const handleGenerate = async () => {
    if (!genRefFile) return;
    setGenLoading(true);
    setGenResult(null);
    try {
      // 파일 → base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          const dataUrl = e.target?.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(genRefFile.file);
      });

      // 생성 요청 (Gemini — 동기 응답, 폴링 불필요)
      const genRes = await fetch(`/api/webtoons/${webtoonId}/reference-items/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImageBase64: base64,
          mimeType: genRefFile.file.type || 'image/png',
          characterSheetUrl: selectedSheet?.file_path ?? undefined,
          additionalInstruction: genInstruction.trim() || undefined,
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error || '생성 요청 실패');
      }
      const { imageData, mimeType } = await genRes.json();
      setGenResult({ base64: imageData, mimeType: mimeType ?? 'image/png' });
    } catch (e) {
      alert(e instanceof Error ? e.message : '생성 실패');
      setGenLoading(false);
    }
  };

  const handleGenSave = async () => {
    if (!genResult || !genName.trim()) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/webtoons/${webtoonId}/reference-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: genResult.base64,
          mimeType: genResult.mimeType,
          type: uploadDialog.type,
          name: genName.trim(),
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const newItem = await res.json();
      setItems(prev => [newItem, ...prev]);
      closeUploadDialog();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setUploading(false);
    }
  };

  // ─── 수정본 생성 (동기) ───────────────────────
  const handleModifySubmit = async () => {
    if (!modifyDialog.item || !modifyInstruction.trim()) return;
    setModifying(true);
    try {
      const newItem = await modifyReferenceItem(
        webtoonId, modifyDialog.item.id, modifyInstruction.trim(), modifyName.trim() || undefined
      );
      setItems(prev => [newItem, ...prev]);
      setModifyDialog({ open: false, item: null });
      setModifyInstruction('');
      setModifyName('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '수정 요청 실패');
    } finally {
      setModifying(false);
    }
  };

  // ─── 레퍼런스로 새 요소 만들기 ───────────────
  const handleCreateFromRefs = async () => {
    if (cfrSelectedIds.size === 0 || !cfrInstruction.trim() || !cfrName.trim()) return;
    setCfrLoading(true);
    try {
      const newItem = await createReferenceItemFromRefs(
        webtoonId,
        Array.from(cfrSelectedIds),
        cfrInstruction.trim(),
        cfrName.trim(),
        cfrType,
      );
      setItems(prev => [newItem, ...prev]);
      setCreateFromRefsDialog(false);
      setCfrSelectedIds(new Set());
      setCfrInstruction('');
      setCfrName('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '생성 요청 실패');
    } finally {
      setCfrLoading(false);
    }
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

  // ─── 필터 ─────────────────────────────────────
  const filteredChars = charFilter === 'all'
    ? characters
    : characters.filter(c => (c as any).role === charFilter || (c as any).category === charFilter);

  const outfitItems = items.filter(i => i.type === 'outfit' &&
    (!outfitSearch.trim() || i.name.toLowerCase().includes(outfitSearch.toLowerCase())));

  const propItems = items.filter(i => i.type === 'prop' &&
    (!propSearch.trim() || i.name.toLowerCase().includes(propSearch.toLowerCase())));

  const canCompose = !!selectedSheet && equipped.length > 0 && !isLoading;

  // ─── 로딩 ─────────────────────────────────────
  if (loadingChars) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-background">

      {/* ── 상단 헤더 ─────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b bg-card">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </Button>
        <div className="h-5 w-px bg-border" />
        <span className="text-sm font-semibold">캐릭터 드레스업</span>
      </div>

      {/* ── 메인 3단 레이아웃 ──────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ────────────────────────────────────────────
            왼쪽: 캐릭터 목록
        ──────────────────────────────────────────── */}
        <div className="w-[200px] flex-shrink-0 flex flex-col border-r bg-muted/20">
          {/* 필터 */}
          <div className="flex-shrink-0 p-2 border-b">
            <Select value={charFilter} onValueChange={setCharFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 캐릭터</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 캐릭터 카드 목록 */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {filteredChars.map(char => {
                const thumb = char.character_sheets?.[0]?.file_path;
                const isSelected = selectedChar?.id === char.id;
                return (
                  <div key={char.id}>
                    <button
                      onClick={() => handleSelectChar(char)}
                      className={`w-full rounded-xl overflow-hidden border-2 transition-all duration-150 ${
                        isSelected
                          ? 'border-primary shadow-md shadow-primary/20'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      {/* 썸네일 */}
                      <div className="aspect-[3/4] bg-muted relative">
                        {thumb ? (
                          <img src={thumb} alt={char.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 opacity-20" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                      {/* 이름 */}
                      <div className="px-2 py-1.5 bg-card">
                        <p className="text-xs font-medium text-center truncate">{char.name}</p>
                      </div>
                    </button>

                    {/* 시트 선택 (해당 캐릭터가 선택됐고 시트 여러 개일 때) */}
                    {isSelected && (char.character_sheets?.length ?? 0) > 1 && (
                      <div className="mt-1.5 px-0.5">
                        <Select
                          value={selectedSheet?.id ?? ''}
                          onValueChange={v => {
                            const sheet = char.character_sheets?.find(s => s.id === v) ?? null;
                            setSelectedSheet(sheet);
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue placeholder="시트 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {char.character_sheets!.map(sheet => (
                              <SelectItem key={sheet.id} value={sheet.id} className="text-xs">
                                {sheet.file_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredChars.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-8">캐릭터 없음</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ────────────────────────────────────────────
            가운데: 의상 + 소품 리포지터리
        ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-end px-4 pt-3 pb-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs px-2"
              onClick={() => { setCreateFromRefsDialog(true); setCfrSelectedIds(new Set()); }}
            >
              <Wand2 className="h-3.5 w-3.5" />
              레퍼런스로 새 요소 만들기
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">

              {/* 의상 섹션 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Shirt className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold">의상</span>
                  <span className="text-xs text-muted-foreground">({items.filter(i => i.type === 'outfit').length})</span>
                  <div className="flex-1" />
                  <Input
                    value={outfitSearch}
                    onChange={e => setOutfitSearch(e.target.value)}
                    placeholder="검색..."
                    className="h-7 w-32 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs px-2"
                    onClick={() => setUploadDialog({ open: true, type: 'outfit' })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </Button>
                </div>

                {loadingItems ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : outfitItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Shirt className="h-7 w-7 opacity-20 mb-1" />
                    <p className="text-xs">의상이 없습니다</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                    {outfitItems.map(item => (
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
              </section>

              {/* 소품 섹션 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold">소품</span>
                  <span className="text-xs text-muted-foreground">({items.filter(i => i.type === 'prop').length})</span>
                  <div className="flex-1" />
                  <Input
                    value={propSearch}
                    onChange={e => setPropSearch(e.target.value)}
                    placeholder="검색..."
                    className="h-7 w-32 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs px-2"
                    onClick={() => setUploadDialog({ open: true, type: 'prop' })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </Button>
                </div>

                {loadingItems ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : propItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Package className="h-7 w-7 opacity-20 mb-1" />
                    <p className="text-xs">소품이 없습니다</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                    {propItems.map(item => (
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
              </section>

            </div>
          </ScrollArea>
        </div>

        {/* ────────────────────────────────────────────
            오른쪽: 컴포즈 패널 (항상 표시)
        ──────────────────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 flex flex-col border-l bg-card">

          {/* 선택된 아이템 + 지시 */}
          <div className="flex-shrink-0 border-b">
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                선택된 아이템 ({equipped.length}/5)
              </p>

              {equipped.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  가운데에서 의상/소품을 선택하세요
                </p>
              ) : (
                <div className="space-y-1.5">
                  {equipped.map(({ item, instruction }) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5">
                      <img src={item.file_path} className="w-8 h-8 rounded object-cover flex-shrink-0" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                            item.type === 'outfit' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.type === 'outfit' ? '의상' : '소품'}
                          </span>
                          <span className="text-xs truncate">{item.name}</span>
                        </div>
                        <Input
                          value={instruction}
                          onChange={e => updateInstruction(item.id, e.target.value)}
                          placeholder="지시 (예: 검정으로)"
                          className="h-6 text-xs bg-background border-0 px-1 focus-visible:ring-0"
                        />
                      </div>
                      <button onClick={() => unequip(item.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Input
                value={globalInstruction}
                onChange={e => setGlobalInstruction(e.target.value)}
                placeholder="전체 지시 (예: 어두운 톤으로)"
                className="h-8 text-xs mt-3"
              />
            </div>

            {/* 생성 버튼 */}
            <div className="px-4 pb-4">
              <Button
                onClick={handleCompose}
                disabled={!canCompose}
                className="w-full gap-2 h-10"
                size="default"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /><StatusLabel status={status} /></>
                ) : (
                  <><Sparkles className="h-4 w-4" />시트 만들기</>
                )}
              </Button>
              {!selectedSheet && (
                <p className="text-[11px] text-center text-muted-foreground mt-1.5">
                  캐릭터를 선택하세요
                </p>
              )}
            </div>
          </div>

          {/* 생성 결과 */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              {isLoading && !resultImage && (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                  <div className="text-sm"><StatusLabel status={status} /></div>
                  <p className="text-xs opacity-60">약 2~4분 소요됩니다</p>
                </div>
              )}

              {resultImage && (
                <>
                  <div className="relative">
                    <img
                      src={`data:${resultImage.mimeType};base64,${resultImage.base64}`}
                      alt="결과"
                      className="w-full rounded-xl border shadow-sm"
                    />
                    <button
                      onClick={reset}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background shadow"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>

                  {/* 수정 입력 */}
                  <div className="flex gap-2">
                    <Input
                      value={refineInstruction}
                      onChange={e => setRefineInstruction(e.target.value)}
                      placeholder="수정 지시 (예: 숄 색상 더 진하게)"
                      className="flex-1 text-xs h-8"
                      onKeyDown={e => { if (e.key === 'Enter' && refineInstruction.trim() && !isLoading) handleRefine(); }}
                      disabled={isLoading}
                    />
                    <Button variant="outline" size="sm" className="h-8 gap-1 px-2" onClick={handleRefine}
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
                </>
              )}

              {!resultImage && !isLoading && !error && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Sparkles className="h-10 w-10 opacity-15 mb-2" />
                  <p className="text-xs">생성 결과가 여기에 표시됩니다</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── 업로드 다이얼로그 ─────────────────────── */}
      <Dialog open={uploadDialog.open} onOpenChange={o => { if (!o) closeUploadDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{uploadDialog.type === 'outfit' ? '의상' : '소품'} 추가</DialogTitle>
          </DialogHeader>

          {/* 모드 선택 탭 */}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setUploadMode('direct')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors ${
                uploadMode === 'direct' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              직접 추가
            </button>
            <button
              onClick={() => setUploadMode('generate')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors ${
                uploadMode === 'generate' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              생성형 추가
            </button>
          </div>

          {/* ── 직접 추가 ── */}
          {uploadMode === 'direct' && (
            <div className="space-y-4">
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
                <Button variant="outline" onClick={closeUploadDialog}>취소</Button>
                <Button onClick={handleUploadSubmit} disabled={!uploadFile || !uploadName.trim() || uploading} className="gap-1.5">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  추가
                </Button>
              </div>
            </div>
          )}

          {/* ── 생성형 추가 ── */}
          {uploadMode === 'generate' && (
            <div className="space-y-4">
              {/* 설명 */}
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                레퍼런스 사진을 업로드하면 현재 선택된 캐릭터의 그림체로 변환합니다.
                {selectedSheet ? (
                  <span className="text-primary font-medium"> 스타일 기준: {selectedChar?.name}</span>
                ) : (
                  <span className="text-amber-600"> (캐릭터 미선택 — 일반 만화체로 변환)</span>
                )}
              </div>

              {/* 레퍼런스 이미지 + 결과 나란히 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 레퍼런스 업로드 */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">레퍼런스 사진</p>
                  <div
                    className="border-2 border-dashed rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors aspect-square flex items-center justify-center bg-muted/30"
                    onClick={() => !genLoading && genRefFileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && !genLoading) handleGenRefFile(f); }}
                  >
                    {genRefFile ? (
                      <img src={genRefFile.previewUrl} className="w-full h-full object-contain" alt="ref" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground p-4 text-center">
                        <Upload className="h-6 w-6 opacity-40" />
                        <p className="text-xs">실사 사진, 스케치 등</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 생성 결과 */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">생성 결과</p>
                  <div className="border-2 border-border rounded-xl overflow-hidden aspect-square flex items-center justify-center bg-muted/30 relative">
                    {genLoading ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
                        <p className="text-xs">변환 중…</p>
                      </div>
                    ) : genResult ? (
                      <img
                        src={`data:${genResult.mimeType};base64,${genResult.base64}`}
                        className="w-full h-full object-contain"
                        alt="result"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground p-4 text-center">
                        <Wand2 className="h-6 w-6 opacity-20" />
                        <p className="text-xs">생성 후 표시됩니다</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <input ref={genRefFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleGenRefFile(f); }} />

              {/* 추가 지시 */}
              <Input
                value={genInstruction}
                onChange={e => setGenInstruction(e.target.value)}
                placeholder="추가 지시 (예: 소매 없애줘, 검정 버전으로, 판타지풍으로)"
                disabled={genLoading}
              />

              {/* 이름 */}
              <Input
                value={genName}
                onChange={e => setGenName(e.target.value)}
                placeholder="아이템 이름"
                disabled={genLoading}
              />

              {/* 버튼 */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeUploadDialog} disabled={genLoading}>취소</Button>
                {!genResult ? (
                  <Button onClick={handleGenerate} disabled={!genRefFile || genLoading} className="gap-1.5">
                    {genLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {genLoading ? '변환 중…' : '생성하기'}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleGenerate} disabled={genLoading} className="gap-1.5">
                      <RefreshCw className="h-4 w-4" />
                      재생성
                    </Button>
                    <Button onClick={handleGenSave} disabled={!genName.trim() || uploading} className="gap-1.5">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      추가
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* ── 레퍼런스로 새 요소 만들기 다이얼로그 ─── */}
      <Dialog open={createFromRefsDialog} onOpenChange={o => { if (!cfrLoading) setCreateFromRefsDialog(o); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>레퍼런스로 새 요소 만들기</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex gap-4 min-h-0">
            {/* 왼쪽: 아이템 선택 */}
            <div className="flex-1 flex flex-col min-h-0">
              <p className="text-xs text-muted-foreground mb-2">
                레퍼런스로 사용할 아이템 선택 (최대 4개 — {cfrSelectedIds.size}/4)
              </p>
              <ScrollArea className="flex-1 min-h-0 overflow-hidden border rounded-lg">
                <div className="p-2 grid grid-cols-3 gap-2">
                  {items.map(item => {
                    const selected = cfrSelectedIds.has(item.id);
                    const maxed = cfrSelectedIds.size >= 4 && !selected;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (maxed) return;
                          setCfrSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                            return next;
                          });
                        }}
                        className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                          selected ? 'border-primary' : maxed ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="aspect-square bg-muted">
                          <img src={item.file_path} className="w-full h-full object-cover" alt={item.name} />
                        </div>
                        <p className="text-[10px] text-center px-1 py-0.5 truncate">{item.name}</p>
                        {selected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="col-span-3 flex items-center justify-center py-8 text-muted-foreground text-xs">
                      아이템이 없습니다
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* 오른쪽: 설정 */}
            <div className="w-52 flex-shrink-0 flex flex-col gap-3">
              <div>
                <p className="text-xs font-medium mb-1">새 요소 이름</p>
                <Input
                  value={cfrName}
                  onChange={e => setCfrName(e.target.value)}
                  placeholder="예: H3 커스텀 변형"
                  className="text-sm"
                  disabled={cfrLoading}
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-1">타입</p>
                <Select value={cfrType} onValueChange={v => setCfrType(v as 'outfit' | 'prop')} disabled={cfrLoading}>
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outfit">의상</SelectItem>
                    <SelectItem value="prop">소품</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium mb-1">생성 지시</p>
                <Textarea
                  value={cfrInstruction}
                  onChange={e => setCfrInstruction(e.target.value)}
                  placeholder="예: 선택한 상의를 베이스로, 소매를 더 넓게 하고 색상을 어두운 네이비로 변경"
                  rows={5}
                  disabled={cfrLoading}
                  className="text-sm resize-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleCreateFromRefs}
                  disabled={cfrSelectedIds.size === 0 || !cfrInstruction.trim() || !cfrName.trim() || cfrLoading}
                  className="w-full gap-1.5"
                >
                  {cfrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {cfrLoading ? '생성 중…' : '새 요소 생성'}
                </Button>
                <Button variant="outline" onClick={() => setCreateFromRefsDialog(false)} disabled={cfrLoading} className="w-full">
                  취소
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 수정본 생성 다이얼로그 ────────────────── */}
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
                <Button onClick={handleModifySubmit} disabled={!modifyInstruction.trim() || modifying} className="gap-1.5">
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
      <div className="aspect-square bg-muted">
        <img src={item.file_path} alt={item.name} className="w-full h-full object-cover" />
      </div>

      {equipped && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}

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

      <div className="px-1.5 py-1 bg-card">
        <p className="text-[11px] text-center truncate">{item.name}</p>
        {item.parent_id && <p className="text-[9px] text-center text-muted-foreground">수정본</p>}
      </div>
    </div>
  );
}
