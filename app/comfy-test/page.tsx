'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Wand2, Copy, Check, Loader2, ExternalLink } from 'lucide-react';

interface GenerateResponse {
  image_url: string;
  prompt_id: string;
  workflow_name: string;
}

export default function ComfyTestPage() {
  const router = useRouter();
  const { user, profile } = useStore();

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [seed, setSeed] = useState<string>('-1');
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 로그인 확인
  if (!user || !profile) {
    router.push('/login');
    return null;
  }

  const generateImage = async () => {
    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요');
      return;
    }

    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const response = await fetch(
        'https://api.rewardpang.com/thegrim-cms/comfyui/generate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workflow_name: 'text2img_basic.json',
            prompt: prompt.trim(),
            negative_prompt: negativePrompt.trim() || '',
            seed: useRandomSeed ? -1 : parseInt(seed) || -1,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data: GenerateResponse = await response.json();
      setImageUrl(data.image_url);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('504') || err.name === 'AbortError') {
          setError('작업이 타임아웃되었습니다. 다시 시도해주세요.');
        } else {
          setError(err.message);
        }
      } else {
        setError('알 수 없는 오류가 발생했습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!imageUrl) return;
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('클립보드 복사에 실패했습니다');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <div className="border-b border-border/40 bg-card">
        <div className="container mx-auto max-w-[1600px] px-4 sm:px-6">
          <div className="flex items-center h-14 gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/')}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">돌아가기</span>
            </Button>
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">ComfyUI 테스트</h1>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 입력 패널 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">이미지 생성</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 프롬프트 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  프롬프트 <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="예: a beautiful sunset over the ocean, vibrant colors"
                  className="w-full min-h-[120px] p-3 text-sm border border-border rounded-md bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={loading}
                />
              </div>

              {/* 네거티브 프롬프트 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  네거티브 프롬프트 (선택)
                </label>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="예: blurry, low quality, distorted"
                  className="w-full min-h-[80px] p-3 text-sm border border-border rounded-md bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={loading}
                />
              </div>

              {/* 시드 설정 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">시드 값</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useRandomSeed}
                      onChange={(e) => setUseRandomSeed(e.target.checked)}
                      className="w-4 h-4 rounded border-border"
                      disabled={loading}
                    />
                    <span className="text-sm">랜덤 시드</span>
                  </label>
                  {!useRandomSeed && (
                    <Input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      placeholder="시드 값 입력"
                      className="w-32 h-8 text-sm"
                      disabled={loading}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  동일한 시드 값을 사용하면 같은 결과를 재현할 수 있습니다.
                </p>
              </div>

              {/* 에러 메시지 */}
              {error && (
                <div className="p-3 text-sm bg-destructive/10 text-destructive rounded-md">
                  {error}
                </div>
              )}

              {/* 생성 버튼 */}
              <Button
                onClick={generateImage}
                disabled={loading || !prompt.trim()}
                className="w-full h-10"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    생성 중... (약 4-5초 소요)
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    이미지 생성
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 결과 패널 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">생성 결과</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p className="text-sm">이미지를 생성하고 있습니다...</p>
                  <p className="text-xs mt-1">잠시만 기다려주세요</p>
                </div>
              ) : imageUrl ? (
                <div className="space-y-4">
                  {/* 생성된 이미지 */}
                  <div className="relative rounded-lg overflow-hidden bg-muted">
                    <img
                      src={imageUrl}
                      alt="Generated"
                      className="w-full h-auto"
                      onError={() => setError('이미지 로드에 실패했습니다')}
                    />
                  </div>

                  {/* 이미지 URL */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">이미지 URL</label>
                    <div className="flex gap-2">
                      <Input
                        value={imageUrl}
                        readOnly
                        className="text-xs h-8 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        className="h-8 px-3 shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(imageUrl, '_blank')}
                        className="h-8 px-3 shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground border-2 border-dashed border-border rounded-lg">
                  <Wand2 className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-sm">생성된 이미지가 여기에 표시됩니다</p>
                  <p className="text-xs mt-1">프롬프트를 입력하고 생성 버튼을 클릭하세요</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 사용 가이드 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">사용 가이드</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <div>
              <h4 className="font-medium text-foreground mb-1">프롬프트 작성 팁</h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>원하는 이미지의 특징을 구체적으로 설명하세요</li>
                <li>예: &quot;a beautiful sunset over the ocean, vibrant colors, dramatic clouds&quot;</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">네거티브 프롬프트</h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>제외하고 싶은 요소를 명시하세요</li>
                <li>예: &quot;blurry, low quality, distorted, ugly, bad anatomy&quot;</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">시드 값</h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>랜덤 시드: 매번 다른 이미지가 생성됩니다</li>
                <li>고정 시드: 동일한 프롬프트와 시드로 같은 이미지를 재현할 수 있습니다</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

