'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Upload, X, Download, Pencil, BookImage } from 'lucide-react';

const DEFAULT_LINE_PROMPT = `[지시사항]
너는 내가 제공한 '이미지 1' 작가의 수석 어시스턴트야. 너의 유일한 목표는 이미지 1에 담긴 작가 고유의 **'펜선의 미학(Ink line aesthetics)'**을 완벽하게 분석하고, 그것을 이미지 2의 스케치 위에 똑같이 재현하는 거야. 아래 규칙에 따라 역동적인 흑백 선화를 완성해 줘.

[이미지 역할 부여]
이미지 1 (스타일 레퍼런스 - 펜선의 '강약'과 '속도감' 복제): 이 이미지에서 작가가 펜을 다루는 방식만 100% 흡수해.
극단적인 강약 조절 (Dynamic Line Weight): 일정한 두께의 선은 버려라. 피사체의 주요 외곽선이나 그림자가 지는 꺾임 부분은 G펜을 꾹 눌러 쓴 것처럼 힘 있고 굵게 잡고, 머리카락, 옷의 잔주름, 얼굴 묘사 등은 마루펜을 쓴 것처럼 금방이라도 끊어질 듯 가늘고 예리하게 처리해. 하나의 선 안에서도 굵기가 다이내믹하게 변해야 해.
속도감과 날카로운 테이퍼링 (Fast, Tapered Strokes): 천천히 따라 그린 듯한 둥글고 정적인 선은 안 돼. 작가가 손목의 스냅을 이용해 빠르게 그은 것처럼, 모든 선의 끝부분이 바늘처럼 뾰족하게 휙 빠지는(Tapering) 속도감을 완벽히 흉내 내.
아날로그 펜의 질감 (Traditional Ink feel): 벡터 프로그램으로 딴 것 같은 인위적인 매끄러움 대신, 종이 위에 잉크가 스며든 듯한 날 것의 선맛을 살려.
이미지 2 (형태 베이스): 이 이미지의 캐릭터 형태, 이목구비 위치, 포즈, 배경 구도를 100% 완벽하게 밑그림으로 사용해. 형태를 변형하거나 없는 피사체를 창작하지 마.

[절대 금지 사항 (Negative Directives) - 매우 중요]
균일하고 둔탁한 선 절대 금지 (NO Monoline, NO Uniform thickness): 선 굵기 변화가 없는 사인펜/마커펜 느낌, 컬러링북 같은 평면적인 느낌, 디지털 벡터 라인아트는 최악의 결과야.
명암 및 먹칠 금지 (NO Shading, NO Solid Black Fills): 해칭(빗금), 회색 톤워크, 넓은 면적을 까맣게 칠하는 먹칠은 하지 마. 오직 **'선의 두께 변화'만으로 입체감을 묘사한 순수한 선화(Pure line-art)**를 만들어야 해.
콘텐츠 혼합 금지: 이미지 1의 인물(긴 머리 소녀, 망토 쓴 사람 등)이나 사물의 형태는 결과물에 단 하나도 섞이지 않게 해. 형태는 오직 이미지 2야.

[최종 목표]
이미지 2의 러프 스케치를, 이미지 1 작가가 직접 펜을 쥐고 **'특유의 힘찬 굵은 선과 예리한 잔선이 교차하는 다이내믹한 펜터치'**로 정서(Clean-up)한 결과물로 만들어줘. 선의 매력이 극대화된 고해상도 흑백 만화 라인아트(White background, Black ink)여야 해.`;

const DEFAULT_MANGA_PROMPT = `[지시사항]
너는 일본 최정상급 소년 만화가의 수석 어시스턴트이자, 펜선의 완급 조절과 여백의 미를 완벽하게 이해하고 있는 '인킹(Inking) 마스터'야. 내가 제공한 두 이미지를 바탕으로 아래 규칙에 따라 '날카롭고 세련된 고해상도 흑백 만화 원고'를 완성해 줘.

[이미지 역할 부여]
이미지 1 (라인 스타일 & 밸런스 레퍼런스): 이 이미지에서는 **'극단적으로 예리한 선맛'과 '여백 및 먹칠의 완벽한 대비'**만 추출해.
과감한 여백(Negative Space): 빛을 받는 피부, 밝은 옷감 등은 선을 채우지 말고 하얀 여백으로 깔끔하게 남겨둬. 만화 특유의 시원한 느낌을 살려야 해.
절제되고 예리한 해칭(Selective & Razor-sharp Hatching): 해칭(빗금)을 남발하지 마. 옷의 깊은 주름, 사물의 거친 질감, 아주 어두운 그림자 영역에만 제한적으로 사용하되, 그 빗금은 바늘처럼 가늘고(Needle-thin) 날카로워야 해. 둔탁하게 떡진 선은 안 돼.
블랙 스팟(Spotting Blacks): 머리카락의 어둠이나 가장 깊은 그림자에는 잔선을 긋는 대신, 잉크를 통째로 부은 듯한 완전한 검은색 면(Solid black)을 칠해 시선을 집중시켜.
이미지 2 (형태 베이스): 이 이미지는 네가 정서할 '러프 스케치'야. 피사체의 형태, 구도, 포즈만 100% 그대로 가져오고, 그 위에 너의 정교하고 깔끔한 G펜 펜터치를 입혀.

[절대 금지 사항 (Negative Directives) - 매우 중요]
과잉 렌더링 및 둔탁한 빗금 절대 금지(No over-rendering, No clunky cross-hatching): 모든 면적을 빗금으로 덮으려는 시도를 절대 하지 마. 굵고 지저분하게 그어진 둔탁한 해칭은 최악이야. 명암은 여백과 검은 면의 대비로 일차적으로 잡고, 해칭은 거드는 용도로만 최소화해.
균일한 두께의 선 금지: 외곽선은 단단하고 또렷하게 잡고, 내부 묘사 선은 금방이라도 끊어질 듯 얇고 예리하게, 굵기 변화(Dynamic line weight)를 극대화해.
그라데이션 톤 금지: 회색조 명암은 절대 넣지 마. 오직 100% 검은색 선과 면, 그리고 하얀색 배경뿐이야.
콘텐츠 혼합 금지: 이미지 1의 캐릭터, 배경, 사물 형태는 결과물에 절대 섞이지 않게 해.

[최종 목표]
이미지 2의 거친 스케치를, 이미지 1 작가가 불필요한 묘사는 과감히 생략하고 **'시원한 여백', '묵직한 먹칠', '극도로 얇고 날카로운 포인트 해칭'**만으로 깔끔하게 완성한 하이퀄리티 만화 원고(Professional Manga Inking)로 만들어줘.`;

type Mode = 'line' | 'manga';

interface HistoryItem {
  id: string;
  mode: Mode;
  image_url: string;
  created_at: string;
}

export default function JungkiStylePage() {
  const [sketchFile, setSketchFile] = useState<File | null>(null);
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Mode>('line');
  const [linePrompt, setLinePrompt] = useState(DEFAULT_LINE_PROMPT);
  const [mangaPrompt, setMangaPrompt] = useState(DEFAULT_MANGA_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 탭별 히스토리
  const [lineHistory, setLineHistory] = useState<HistoryItem[]>([]);
  const [mangaHistory, setMangaHistory] = useState<HistoryItem[]>([]);
  // 우측 패널에서 현재 크게 보이는 이미지
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    try {
      const [lineRes, mangaRes] = await Promise.all([
        fetch('/api/jungki-style?mode=line'),
        fetch('/api/jungki-style?mode=manga'),
      ]);
      const [lineData, mangaData] = await Promise.all([lineRes.json(), mangaRes.json()]);
      if (Array.isArray(lineData)) setLineHistory(lineData);
      if (Array.isArray(mangaData)) setMangaHistory(mangaData);
    } catch (e) {
      console.error('히스토리 로드 실패:', e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 탭 전환 시 해당 탭의 최신 이미지를 우측에 표시
  useEffect(() => {
    const history = activeTab === 'line' ? lineHistory : mangaHistory;
    if (history.length > 0 && selectedMode !== activeTab) {
      setSelectedUrl(history[0].image_url);
      setSelectedMode(activeTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, lineHistory, mangaHistory]);

  const handleFileChange = useCallback((file: File) => {
    setSketchFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setSketchPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFileChange(file);
    },
    [handleFileChange]
  );

  const deleteHistoryItem = async (id: string, imageUrl: string) => {
    try {
      await fetch(`/api/jungki-style?id=${id}`, { method: 'DELETE' });
      setLineHistory((prev) => prev.filter((item) => item.id !== id));
      setMangaHistory((prev) => prev.filter((item) => item.id !== id));
      if (selectedUrl === imageUrl) setSelectedUrl(null);
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  };

  const clearSketch = () => {
    setSketchFile(null);
    setSketchPreview(null);
    setError(null);
  };

  const resizeImageToBase64 = (file: File, maxPx = 1500): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const generate = async () => {
    if (!sketchFile || loading) return;
    setLoading(true);
    setError(null);

    try {
      const { base64, mimeType: resizedMime } = await resizeImageToBase64(sketchFile);

      const res = await fetch('/api/jungki-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sketchBase64: base64,
          sketchMimeType: resizedMime,
          mode: activeTab,
          prompt: activeTab === 'line' ? linePrompt : mangaPrompt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');

      const newItem: HistoryItem = {
        id: data.id,
        mode: data.mode,
        image_url: data.imageUrl,
        created_at: data.createdAt,
      };

      // 히스토리 맨 앞에 추가
      if (activeTab === 'line') {
        setLineHistory((prev) => [newItem, ...prev]);
      } else {
        setMangaHistory((prev) => [newItem, ...prev]);
      }

      // 우측 패널에 바로 표시
      setSelectedUrl(data.imageUrl);
      setSelectedMode(activeTab);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async (imageUrl: string, filename: string) => {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  const currentHistory = activeTab === 'line' ? lineHistory : mangaHistory;
  const currentPrompt = activeTab === 'line' ? linePrompt : mangaPrompt;
  const setCurrentPrompt = activeTab === 'line' ? setLinePrompt : setMangaPrompt;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b flex-shrink-0">
        <h1 className="text-xl font-bold">중기작가스타일</h1>
        <p className="text-xs text-muted-foreground mt-0.5">스케치 이미지를 중기 작가 스타일로 변환합니다</p>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* 왼쪽 컨트롤 패널 */}
        <div className="w-[420px] flex-shrink-0 border-r overflow-y-auto px-4 py-4 space-y-3">
          {/* 1. 스케치 업로드 */}
          <Card>
            <CardContent className="pt-3 pb-3">
              <div
                className={`relative rounded-lg transition-colors ${
                  !sketchPreview
                    ? `border-2 border-dashed p-8 text-center cursor-pointer ${
                        dragOver
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/30 hover:border-muted-foreground/60'
                      }`
                    : dragOver
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={!sketchPreview ? () => fileInputRef.current?.click() : undefined}
              >
                {!sketchPreview ? (
                  <>
                    <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">클릭하거나 드래그하여 스케치 업로드</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, WEBP 지원</p>
                  </>
                ) : (
                  <>
                    <img src={sketchPreview} alt="스케치" className="w-full rounded border" />
                    {dragOver && (
                      <div className="absolute inset-0 rounded-lg bg-primary/20 flex items-center justify-center">
                        <p className="text-sm font-medium text-primary bg-background/90 px-3 py-1.5 rounded">새 이미지로 교체</p>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-80 hover:opacity-100"
                        onClick={() => fileInputRef.current?.click()}
                        title="다른 이미지 선택"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={clearSketch}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileChange(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* 2. 탭 선택 */}
          <div className="flex rounded-lg border p-1 bg-muted/50">
            {(['line', 'manga'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'line' ? <Pencil className="h-3.5 w-3.5" /> : <BookImage className="h-3.5 w-3.5" />}
                {tab === 'line' ? '라인드로잉' : '완성된 만화'}
              </button>
            ))}
          </div>

          {/* 3. 프롬프트 */}
          <Card>
            <CardContent className="pt-3 pb-3">
              <Textarea
                value={currentPrompt}
                onChange={(e) => setCurrentPrompt(e.target.value)}
                className="text-xs font-mono min-h-[180px] resize-y"
              />
            </CardContent>
          </Card>

          {/* 4. 생성 버튼 */}
          <Button
            onClick={generate}
            disabled={!sketchFile || loading}
            className="w-full gap-2"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                생성 중... (약 1~3분 소요)
              </>
            ) : (
              <>
                {activeTab === 'line' ? <Pencil className="h-4 w-4" /> : <BookImage className="h-4 w-4" />}
                {activeTab === 'line' ? '라인드로잉 생성' : '완성된 만화 생성'}
              </>
            )}
          </Button>

          {/* 에러 */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

        </div>

        {/* 오른쪽 결과 패널 */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 썸네일 가로 스크롤 (히스토리 있을 때만) */}
          {currentHistory.length > 0 && (
            <div className="flex-shrink-0 border-b px-4 py-2">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                {currentHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`group flex-shrink-0 relative cursor-pointer rounded border-2 overflow-hidden transition-all w-16 h-16 ${
                      selectedUrl === item.image_url
                        ? 'border-primary'
                        : 'border-transparent hover:border-muted-foreground/40'
                    }`}
                    onClick={() => { setSelectedUrl(item.image_url); setSelectedMode(item.mode); }}
                  >
                    <img src={item.image_url} alt="결과" className="w-full h-full object-cover" />
                    <button
                      className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id, item.image_url); }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 선택된 이미지 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="text-sm">{activeTab === 'line' ? '라인드로잉' : '완성된 만화'} 생성 중...</p>
                <p className="text-xs opacity-60">약 1~3분 소요될 수 있습니다</p>
              </div>
            ) : selectedUrl ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    {selectedMode === 'line' ? '라인드로잉' : '완성된 만화'} 결과
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => downloadImage(selectedUrl, selectedMode === 'line' ? 'jungki_line.png' : 'jungki_manga.png')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    저장
                  </Button>
                </div>
                <img src={selectedUrl} alt="결과" className="w-full rounded border" />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
                <BookImage className="h-16 w-16" />
                <p className="text-sm">생성된 이미지가 여기에 표시됩니다</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
