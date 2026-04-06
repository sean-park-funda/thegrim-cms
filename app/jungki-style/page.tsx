'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Upload, X, Download, Pencil, BookImage } from 'lucide-react';

const DEFAULT_LINE_PROMPT = `**[지시사항]**

너는 일본 최정상급 소년 만화가의 수석 어시스턴트이자 펜터치(Inking) 장인이야. 내가 제공한 두 이미지를 바탕으로 아래 규칙에 따라 완벽한 흑백 선화(Monochrome Manga Line-art)를 완성해 줘.

**[이미지 역할 부여]**

- **이미지 1 (라인 스타일 레퍼런스):** 이 이미지에서는 오직 **'펜선의 미학(Line Quality)'**만 추출해.
    1. G펜을 사용한 듯한 **극도로 예리하고 날카로운 선(Sharp and crisp ink lines)**.
    2. **확실한 선 굵기의 강약 조절(Dynamic line weight)**: 피사체의 외곽선은 단단하고 또렷하게, 머리카락이나 이목구비의 세부 묘사는 아주 가늘고 섬세하게 처리할 것.
    3. 옷주름이나 사물을 그릴 때 사용하는 **날카롭고 각진 직선 위주의 드로잉 방식**.
- **이미지 2 (형태 베이스):** 이 이미지는 네가 그릴 밑그림이야. 캐릭터의 형태, 구도, 포즈, 사물의 위치 등 스케치의 뼈대를 100% 그대로 유지한 채 그 위에 정교한 펜선만 입혀.

**[절대 금지 사항 (Negative Directives)]**

- **명암 및 해칭 엄격 금지:** 톤워크, 크로스 해칭, 지저분한 빗금, 점묘, 그라데이션, 그림자 묘사를 **절대 하지 마.** 입체감은 명암이 아니라 오직 '선의 겹침'과 '굵기 조절'로만 표현해.
- **콘텐츠 혼합 금지:** 이미지 1에 등장하는 특정 인물(긴 머리 소녀, 망토를 쓴 사람, 남자 등), 의상, 무기, 목재 구조물 등의 '형태'는 결과물에 단 하나도 반영되어서는 안 돼.

**[최종 목표]**

이미지 2의 엉성한 스케치를, 이미지 1의 작가가 직접 날카로운 펜으로 정서한 것 같은 '초고해상도 클린 라인 드로잉(Ultra-detailed clean line drawing)'으로 만들어줘. 배경은 하얀색, 선은 검은색인 순수한 선화(Line-art)여야 해.`;

const DEFAULT_MANGA_PROMPT = `[지시사항]
너는 일본 최정상급 소년 만화가의 수석 어시스턴트이자, 압도적인 '작화 밀도(High-density detailing)'를 자랑하는 펜터치 장인이야. 내가 제공한 두 이미지를 바탕으로 아래 규칙에 따라 '극도로 섬세하고 깊이 있는 흑백 만화 원고(Ultra-detailed Monochrome Manga Inking)'를 완성해 줘.

[이미지 역할 부여]
이미지 1 (라인 스타일 & 밀도 레퍼런스): 이 이미지에서는 오직 **'펜선의 극단적인 강약 조절'과 '치밀한 내부 질감 묘사'**만 완벽하게 추출해.
극세선(Ultra-fine mapping pen lines)의 활용: 외곽선만 살짝 힘을 주고, 피사체 내부(머릿결, 옷의 주름, 이목구비, 파편 등)의 묘사는 머리카락보다 얇고 날카로운 펜선으로 수없이 쪼개어 그려 넣어.
정교한 해칭과 빗금(Precise Directional Hatching): 내부를 단순히 하얗게 비워두거나 굵은 선으로 떼우지 마. 레퍼런스 작가처럼 얇고 규칙적인 빗금을 촘촘하게 겹쳐서(Cross-hatching & parallel hatching) 입체감, 질감, 그리고 은은한 명암을 정교하게 쌓아 올려.
과감한 흑백 대비(Spotting solid blacks): 머리카락의 어두운 밑단이나 깊은 그림자 등에는 완전한 검은색(Solid black)을 칠해, 얇은 선들과 극적인 대비를 만들어.
이미지 2 (형태 베이스): 이 이미지는 네가 그릴 '러프 스케치'야. 피사체의 형태, 구도, 포즈, 사물의 위치만 100% 그대로 가져오고, 그 위에 너의 압도적인 펜터치 기술로 디테일을 불어넣어.

[절대 금지 사항 (Negative Directives) - 매우 중요]
투박하고 일정한 두께의 펜선 금지(No thick, uniform lines): 컬러링북이나 벡터 그래픽처럼 선 굵기가 일정하고 두꺼운, 답답하고 평면적인 라인아트는 절대 만들지 마.
지저분한 스케치 느낌 금지: 해칭(빗금)을 넣으라고 해서 연필로 문지른 듯한 지저분한 선이나 털선을 만들라는 것이 아니야. 자를 대고 그은 것처럼 **'정돈되고 깔끔한 잉크 선'**들의 집합이어야 해.
그라데이션 및 회색 톤 금지: 흑과 백 사이의 부드러운 회색조(Grayscale)는 금지. 입체감은 오직 '얇은 선의 밀집도'와 '완전한 흑색'으로만 표현해.
콘텐츠 혼합 금지: 이미지 1에 있는 특정 인물, 사물, 배경 형태는 결과물에 절대 섞이지 않게 해.

[최종 목표]
이미지 2의 거친 스케치를, 이미지 1 작가가 얇고 예리한 펜촉으로 수 시간에 걸쳐 **'극도의 밀도(High detail)와 정교한 해칭(Hatching)'**을 쏟아부어 완성한 것 같은, 입체적이고 화려한 하이퀄리티 흑백 만화 원고로 만들어줘.`;

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
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFileChange(file);
    },
    [handleFileChange]
  );

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
              {!sketchPreview ? (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/60 transition-colors"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">클릭하거나 드래그하여 스케치 업로드</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, WEBP 지원</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(file);
                    }}
                  />
                </div>
              ) : (
                <div className="relative">
                  <img src={sketchPreview} alt="스케치" className="w-full rounded border" />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0"
                    onClick={clearSketch}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
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
                {(tab === 'line' ? lineHistory : mangaHistory).length > 0 && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                    {(tab === 'line' ? lineHistory : mangaHistory).length}
                  </span>
                )}
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

          {/* 5. 히스토리 썸네일 */}
          {currentHistory.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">생성 이력 ({currentHistory.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {currentHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`relative cursor-pointer rounded border-2 overflow-hidden transition-all ${
                      selectedUrl === item.image_url
                        ? 'border-primary'
                        : 'border-transparent hover:border-muted-foreground/40'
                    }`}
                    onClick={() => { setSelectedUrl(item.image_url); setSelectedMode(item.mode); }}
                  >
                    <img
                      src={item.image_url}
                      alt="결과"
                      className="w-full aspect-square object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽 결과 패널 */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
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
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
              <BookImage className="h-16 w-16" />
              <p className="text-sm">생성된 이미지가 여기에 표시됩니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
