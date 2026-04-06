'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const DEFAULT_MANGA_PROMPT = `**[지시사항]**

너는 세계적인 마스터 클래스 만화가이자 펜터치 전문가야. 내가 제공한 두 개의 이미지를 바탕으로 새로운 만화 컷을 완성해줘. 단, 아래의 엄격한 규칙을 반드시 따라야 해.

**[이미지 역할 부여]**

- **이미지 1 (스타일 레퍼런스):** 이 이미지에서는 **오직 '그림체'와 '렌더링 기법'만** 가져와야 해. 펜선의 두께와 필압, 잉크의 질감, 크로스 해칭(Hatching) 방식, 명암을 처리하는 톤워크, 선의 거친 정도나 날카로움 같은 '기법적 특성'만 완벽하게 분석하고 추출해.
- **이미지 2 (콘텐츠 & 구도 베이스):** 이 이미지는 네가 그릴 **'피사체'와 '구도'의 전부**야. 이미지 2에 있는 스케치의 형태, 캐릭터의 포즈, 배경의 위치, 사물들을 한 치의 오차 없이 그대로 밑그림으로 사용해.

**[절대 금지 사항 (Negative Prompt)]**

- 이미지 1에 등장하는 특정 인물의 얼굴, 헤어스타일, 의상, 사물, 배경, 텍스트 등 **'형태를 가진 모든 피사체'는 결과물에 절대 섞이지 않게 해.**
- 이미지 2의 스케치에 없는 무언가를 창작해서 추가하지 마.

**[최종 목표]**

이미지 2의 엉성한 스케치를, 이미지 1의 작가가 자신의 고유한 펜터치와 해칭 스타일로 '완성(펜터치 및 렌더링)'한 것 같은 만화 이미지를 만들어줘. 흑백 만화(Monochrome Manga) 스타일을 유지해 줘.`;

export default function JungkiStylePage() {
  const [sketchFile, setSketchFile] = useState<File | null>(null);
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);
  const [linePrompt, setLinePrompt] = useState(DEFAULT_LINE_PROMPT);
  const [mangaPrompt, setMangaPrompt] = useState(DEFAULT_MANGA_PROMPT);
  const [loadingMode, setLoadingMode] = useState<'line' | 'manga' | null>(null);
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

  const generate = async (mode: 'line' | 'manga') => {
    if (!sketchFile || loadingMode) return;
    setLoadingMode(mode);
    setError(null);

    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(sketchFile);
      });

      const res = await fetch('/api/jungki-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sketchBase64: base64,
          sketchMimeType: sketchFile.type,
          mode,
          prompt: mode === 'line' ? linePrompt : mangaPrompt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');

      const dataUrl = `data:${data.mimeType};base64,${data.imageData}`;
      if (mode === 'line') setLineResult(dataUrl);
      else setMangaResult(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoadingMode(null);
    }
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="w-full h-full overflow-y-auto px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">중기작가스타일</h1>
        <p className="text-sm text-muted-foreground mt-1">스케치 이미지를 중기 작가 스타일로 변환합니다</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 왼쪽: 입력 영역 */}
        <div className="space-y-4">
          {/* 레퍼런스 이미지 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">레퍼런스 (중기 작가 스타일)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <img
                src="/jungkistyle.png"
                alt="중기 작가 스타일 레퍼런스"
                className="w-full rounded border"
              />
            </CardContent>
          </Card>

          {/* 스케치 업로드 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">스케치 이미지 업로드</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!sketchPreview ? (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/60 transition-colors"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">클릭하거나 드래그하여 이미지 업로드</p>
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

          {/* 에러 */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* 생성 버튼 */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => generate('line')}
              disabled={!sketchFile || !!loadingMode}
              variant="outline"
              className="gap-2"
            >
              {loadingMode === 'line' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              라인드로잉
            </Button>
            <Button
              onClick={() => generate('manga')}
              disabled={!sketchFile || !!loadingMode}
              className="gap-2"
            >
              {loadingMode === 'manga' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookImage className="h-4 w-4" />
              )}
              완성된 만화
            </Button>
          </div>
        </div>

        {/* 오른쪽: 프롬프트 + 결과 */}
        <div className="space-y-4">
          {/* 라인드로잉 프롬프트 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5" />
                라인드로잉 프롬프트
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                value={linePrompt}
                onChange={(e) => setLinePrompt(e.target.value)}
                className="text-xs font-mono min-h-[120px] resize-y"
                placeholder="라인드로잉 생성 프롬프트"
              />
            </CardContent>
          </Card>

          {/* 완성된 만화 프롬프트 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookImage className="h-3.5 w-3.5" />
                완성된 만화 프롬프트
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                value={mangaPrompt}
                onChange={(e) => setMangaPrompt(e.target.value)}
                className="text-xs font-mono min-h-[120px] resize-y"
                placeholder="완성된 만화 생성 프롬프트"
              />
            </CardContent>
          </Card>

          {/* 라인드로잉 결과 */}
          {lineResult && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">라인드로잉 결과</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => downloadImage(lineResult, 'jungki_line.png')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    저장
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <img src={lineResult} alt="라인드로잉 결과" className="w-full rounded border" />
              </CardContent>
            </Card>
          )}

          {/* 완성된 만화 결과 */}
          {mangaResult && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">완성된 만화 결과</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => downloadImage(mangaResult, 'jungki_manga.png')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    저장
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <img src={mangaResult} alt="완성된 만화 결과" className="w-full rounded border" />
              </CardContent>
            </Card>
          )}

          {/* 로딩 상태 */}
          {loadingMode && (
            <Card>
              <CardContent className="py-12 flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {loadingMode === 'line' ? '라인드로잉' : '완성된 만화'} 생성 중...
                </p>
                <p className="text-xs text-muted-foreground/60">약 1~3분 소요될 수 있습니다</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
