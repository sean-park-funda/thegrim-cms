'use client';

import { useState, useRef, useCallback } from 'react';
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
너는 일본 최정상급 소년 만화가의 수석 어시스턴트이자, 거친 스케치를 완벽한 최종 원고로 탈바꿈시키는 **'펜터치(Inking) 장인'**이야. 내가 제공한 두 이미지를 바탕으로 아래 규칙에 따라 '극도로 깔끔하고 강렬한 흑백 만화 원고(Ultra-crisp Monochrome Manga Inking)'를 완성해 줘.

[이미지 역할 부여]
이미지 1 (라인 스타일 레퍼런스): 이 이미지에서는 오직 **'프로의 정제된 펜터치 기법과 먹(Ink)의 사용법'**만 완벽하게 추출해.
극도의 선명함(Ultra-crisp G-pen lines): 스케치의 잔선은 단 하나도 남기지 마. 모든 선은 날카로운 펜촉으로 한 번에 그은 듯 매끄럽고 단단해야 해.
과감한 먹칠(Spotting Blacks / Solid black fills): 작가 특유의 강렬함을 살리기 위해, 머리카락의 어두운 부분, 옷의 깊은 주름, 사물의 그림자 등에 **'완전한 검은색 면(Solid black)'**을 과감하게 배치해서 흑백의 대비(High contrast)를 극대화해.
다이내믹한 선 굵기(Dynamic Line Weight): 외곽선은 굵고 힘 있게, 내부 묘사는 머리카락처럼 가늘고 예리하게 조절해.
이미지 2 (형태 베이스): 이 이미지는 네가 정서(Clean-up)할 '러프 스케치'야. 피사체의 형태, 구도, 포즈만 100% 그대로 가져오고, 지저분한 연필 선의 느낌은 완전히 지워버린 채 그 위에 정교한 잉크 펜선을 새로 입혀.

[절대 금지 사항 (Negative Directives)]
털선 및 잔선 절대 금지(No scratchy or messy lines): 선을 여러 번 겹쳐 그은 듯한 지저분한 스케치 느낌, 털선, 연필 질감은 절대 금지. 오직 '매끄러운 단일 선(Clean single lines)'만 사용해.
애매한 명암 금지: 그라데이션, 회색 톤워크, 지저분한 점묘나 빗금(Messy hatching)으로 명암을 넣지 마. 명암은 오직 **'깔끔한 선의 간격'**과 '새까만 먹칠(Solid black)' 두 가지로만 표현해.
콘텐츠 혼합 금지: 이미지 1에 있는 특정 인물(망토, 긴 머리 등), 사물, 배경 형태는 결과물에 절대 섞이지 않게 해.

[최종 목표]
이미지 2의 거친 스케치를, 이미지 1 작가가 직접 G펜과 잉크를 사용해 **'세밀한 선화'**와 **'과감하고 묵직한 먹칠'**로 최종 마감(Final Inked page)을 한 것 같은 하이퀄리티 흑백 원고 이미지로 만들어줘.`;

type Mode = 'line' | 'manga';

export default function JungkiStylePage() {
  const [sketchFile, setSketchFile] = useState<File | null>(null);
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Mode>('line');
  const [linePrompt, setLinePrompt] = useState(DEFAULT_LINE_PROMPT);
  const [mangaPrompt, setMangaPrompt] = useState(DEFAULT_MANGA_PROMPT);
  const [loading, setLoading] = useState(false);
  const [lineResult, setLineResult] = useState<string | null>(null);
  const [mangaResult, setMangaResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((file: File) => {
    setSketchFile(file);
    setLineResult(null);
    setMangaResult(null);
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
    setLineResult(null);
    setMangaResult(null);
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

      const dataUrl = `data:${data.mimeType};base64,${data.imageData}`;
      if (activeTab === 'line') setLineResult(dataUrl);
      else setMangaResult(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const currentResult = activeTab === 'line' ? lineResult : mangaResult;
  const currentPrompt = activeTab === 'line' ? linePrompt : mangaPrompt;
  const setCurrentPrompt = activeTab === 'line' ? setLinePrompt : setMangaPrompt;

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">중기작가스타일</h1>
          <p className="text-sm text-muted-foreground mt-1">스케치 이미지를 중기 작가 스타일로 변환합니다</p>
        </div>

        {/* 1. 스케치 업로드 */}
        <Card>
          <CardContent className="pt-4 pb-4">
            {!sketchPreview ? (
              <div
                className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-10 text-center cursor-pointer hover:border-muted-foreground/60 transition-colors"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">클릭하거나 드래그하여 스케치 이미지 업로드</p>
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
            </button>
          ))}
        </div>

        {/* 3. 프롬프트 (탭에 따라 표시) */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <Textarea
              value={currentPrompt}
              onChange={(e) => setCurrentPrompt(e.target.value)}
              className="text-xs font-mono min-h-[200px] resize-y"
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

        {/* 5. 결과 이미지 */}
        {currentResult && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {activeTab === 'line' ? '라인드로잉' : '완성된 만화'} 결과
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  onClick={() => downloadImage(currentResult, activeTab === 'line' ? 'jungki_line.png' : 'jungki_manga.png')}
                >
                  <Download className="h-3.5 w-3.5" />
                  저장
                </Button>
              </div>
              <img src={currentResult} alt="결과" className="w-full rounded border" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
