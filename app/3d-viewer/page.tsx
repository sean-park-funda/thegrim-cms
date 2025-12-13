'use client';

import { Suspense, useState, useRef, Component, ReactNode, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, RotateCcw, AlertCircle, Box, Eye, ArrowRight, RectangleHorizontal, Square, RectangleVertical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';
import { useDropzone } from 'react-dropzone';
import { Loader2 } from 'lucide-react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SAM3DService } from '@/lib/api/sam3d';
import { getCharactersByWebtoon } from '@/lib/api/characters';
import { CharacterWithSheets, CharacterSheet } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import { useAuth } from '@/lib/hooks/useAuth';
import { Save } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('모델 로드 실패:', error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} rotation={[Math.PI, 0, 0]} />;
}

// Canvas 캡처를 위한 컴포넌트
function CanvasCapture({ 
  onCapture,
  onReady
}: { 
  onCapture: (dataUrl: string) => void;
  onReady?: (captureFn: () => string) => void;
}) {
  const { gl, scene, camera } = useThree();

  // 캡처 함수가 준비되면 콜백 호출
  useEffect(() => {
    if (onReady) {
      console.log('[CanvasCapture] 캡처 함수 준비 완료');
      // 캡처 함수: 렌더링을 강제로 실행한 후 캡처
      onReady(() => {
        try {
          // WebGL 컨텍스트 확인
          const context = gl.getContext();
          if (!context) {
            throw new Error('WebGL 컨텍스트가 없습니다');
          }
          
          // 렌더링 강제 실행
          gl.render(scene, camera);
          
          // 동기적으로 캡처 시도
          const dataUrl = gl.domElement.toDataURL('image/png');
          console.log('[CanvasCapture] 즉시 캡처, 데이터 URL 길이:', dataUrl.length);
          console.log('[CanvasCapture] 데이터 URL 시작:', dataUrl.substring(0, 50));
          console.log('[CanvasCapture] Canvas 크기:', gl.domElement.width, 'x', gl.domElement.height);
          
          if (!dataUrl || dataUrl === 'data:,') {
            console.error('[CanvasCapture] 빈 데이터 URL - WebGL 컨텍스트 상태 확인');
            throw new Error('캡처된 이미지가 비어있습니다. Canvas가 제대로 렌더링되지 않았을 수 있습니다.');
          }
          
          onCapture(dataUrl);
          return dataUrl;
        } catch (error) {
          console.error('[CanvasCapture] 캡처 중 오류:', error);
          throw error;
        }
      });
    }
  }, [onReady, gl, scene, camera, onCapture]);

  return null;
}

function Viewer3D({ 
  fileUrl, 
  onError,
  onCaptureReady,
  onClear
}: { 
  fileUrl: string; 
  onError: (error: Error) => void;
  onCaptureReady?: (captureFn: () => string) => void;
  onClear?: () => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [showAxes, setShowAxes] = useState(true);

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  const handleCaptureReady = useCallback((captureFn: () => string) => {
    console.log('[Viewer3D] 캡처 함수 받음:', typeof captureFn);
    console.log('[Viewer3D] onCaptureReady 존재:', !!onCaptureReady);
    if (onCaptureReady) {
      console.log('[Viewer3D] onCaptureReady 호출 중...');
      onCaptureReady(captureFn);
      console.log('[Viewer3D] onCaptureReady 호출 완료');
    } else {
      console.warn('[Viewer3D] onCaptureReady가 없습니다!');
    }
  }, [onCaptureReady]);

  return (
    <div className="w-full h-full relative">
      <Canvas className="w-full h-full">
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <ambientLight intensity={0.8} />
        <hemisphereLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <directionalLight position={[-10, 10, -5]} intensity={0.6} />
        <directionalLight position={[0, -10, 0]} intensity={0.4} />
        {showAxes && <axesHelper args={[5]} />}
        <CanvasCapture 
          onCapture={(dataUrl) => {
            (window as Window & { __capturedImage3D?: string }).__capturedImage3D = dataUrl;
          }}
          onReady={handleCaptureReady}
        />
        <Suspense fallback={null}>
          <ModelErrorBoundary onError={onError}>
            <Model url={fileUrl} />
          </ModelErrorBoundary>
        </Suspense>
        <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} />
      </Canvas>
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {onClear && (
          <Button
            variant="outline"
            size="icon"
            onClick={onClear}
            title="클리어"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          onClick={handleReset}
          title="초기화"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant={showAxes ? "default" : "outline"}
          size="icon"
          onClick={() => setShowAxes(!showAxes)}
          title={showAxes ? '축 숨기기' : '축 표시'}
        >
          <Box className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Viewer3DPage() {
  const searchParams = useSearchParams();
  const { selectedWebtoon } = useStore();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  
  // 캐릭터 변환 관련 상태
  const [characters, setCharacters] = useState<CharacterWithSheets[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterWithSheets | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<CharacterSheet | null>(null);
  const [convertingCharacter, setConvertingCharacter] = useState(false);
  const [convertedImage, setConvertedImage] = useState<string | null>(null);
  // useRef를 사용하여 캡처 함수 저장 (상태 업데이트 문제 방지)
  const captureFnRef = useRef<(() => string) | null>(null);
  const [captureFnReady, setCaptureFnReady] = useState(false);
  const [capturedPoseImage, setCapturedPoseImage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'square' | 'portrait'>('square');
  const [convertedFileId, setConvertedFileId] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [additionalPrompt, setAdditionalPrompt] = useState<string>('');
  const { profile } = useAuth();
  const { selectedCut, selectedEpisode } = useStore();

  // URL 파라미터에서 webtoonId, episodeId, cutId 가져오기 (우선순위: URL > store)
  const webtoonId = searchParams.get('webtoonId') || selectedWebtoon?.id;
  const episodeId = searchParams.get('episodeId') || selectedEpisode?.id;
  const cutIdFromUrl = searchParams.get('cutId') || selectedCut?.id;

  // 디버깅: captureFn 상태 확인
  useEffect(() => {
    console.log('[Viewer3DPage] captureFnReady 상태:', captureFnReady);
  }, [captureFnReady]);

  // fileUrl이 변경되면 captureFn 리셋
  useEffect(() => {
    if (!fileUrl) {
      captureFnRef.current = null;
      setCaptureFnReady(false);
    }
  }, [fileUrl]);

  // setCaptureFn 래퍼 함수 (디버깅용)
  const handleSetCaptureFn = useCallback((fn: () => string) => {
    console.log('[Viewer3DPage] setCaptureFn 호출됨, 함수 타입:', typeof fn);
    // ref에 직접 저장
    captureFnRef.current = fn;
    setCaptureFnReady(true);
    console.log('[Viewer3DPage] setCaptureFn 완료');
  }, []);

  const handleModelError = (error: Error) => {
    console.error('3D 모델 로드 실패:', error);
    setModelError('3D 모델을 로드하는데 실패했습니다. 파일이 유효한 GLB 형식인지 확인해주세요.');
  };

  // 캐릭터 목록 로드 (URL 파라미터의 webtoonId 또는 store의 selectedWebtoon 사용)
  useEffect(() => {
    if (webtoonId) {
      getCharactersByWebtoon(webtoonId)
        .then(setCharacters)
        .catch((err) => {
          console.error('캐릭터 목록 로드 실패:', err);
        });
    } else {
      setCharacters([]);
    }
  }, [webtoonId]);

  // 캐릭터 선택 시 첫 번째 시트 자동 선택
  useEffect(() => {
    if (selectedCharacter?.character_sheets && selectedCharacter.character_sheets.length > 0) {
      setSelectedSheet(selectedCharacter.character_sheets[0]);
    } else {
      setSelectedSheet(null);
    }
  }, [selectedCharacter]);

  // 3D 뷰어 캡처 및 변환
  const handleConvertCharacter = async () => {
    if (!selectedSheet || !fileUrl || !captureFnRef.current) {
      console.log('[Viewer3DPage] 변환 조건 체크:', { 
        selectedSheet: !!selectedSheet, 
        fileUrl: !!fileUrl, 
        captureFn: !!captureFnRef.current 
      });
      setError('캐릭터 시트를 선택하고 3D 모델을 로드해주세요.');
      return;
    }

    setConvertingCharacter(true);
    setError(null);
    setConvertedImage(null);

    try {
      // 1. 3D 뷰어 캡처
      console.log('[Viewer3DPage] 캡처 함수 실행 시작');
      if (!captureFnRef.current) {
        throw new Error('캡처 함수가 설정되지 않았습니다.');
      }
      const capturedDataUrl = captureFnRef.current();
      
      if (!capturedDataUrl) {
        throw new Error('3D 뷰어 캡처에 실패했습니다.');
      }

      // 2. 캐릭터 시트 이미지 가져오기
      const sheetResponse = await fetch(selectedSheet.file_path);
      if (!sheetResponse.ok) {
        throw new Error('캐릭터 시트 이미지를 가져올 수 없습니다.');
      }
      const sheetBlob = await sheetResponse.blob();
      const sheetBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]); // data:image/...;base64, 부분 제거
        };
        reader.onerror = reject;
        reader.readAsDataURL(sheetBlob);
      });

      // 3. 캡처 이미지를 base64로 변환
      const capturedBase64 = capturedDataUrl.split(',')[1];

      // 4. API 호출
      // cutId와 episodeId는 URL 파라미터에서 가져온 값 사용
      // processId는 저장 시 자동으로 선택됨
      // URL 파라미터의 webtoonId 또는 store의 selectedWebtoon 사용
      const webtoonIdForApi = webtoonId || selectedWebtoon?.id;
      
      const response = await fetch('/api/convert-3d-character', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characterSheetImage: {
            base64: sheetBase64,
            mimeType: sheetBlob.type || 'image/png',
          },
          poseImage: {
            base64: capturedBase64,
            mimeType: 'image/png',
          },
          aspectRatio: aspectRatio,
          cutId: cutIdFromUrl,
          episodeId: episodeId,
          webtoonId: webtoonIdForApi,
          createdBy: profile?.id,
          additionalPrompt: additionalPrompt.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '변환에 실패했습니다.');
      }

      const result = await response.json();
      if (result.success && result.image) {
        setConvertedImage(`data:${result.image.mimeType};base64,${result.image.base64}`);
        // fileId가 있으면 저장 (임시 파일로 저장된 경우)
        if (result.fileId) {
          setConvertedFileId(result.fileId);
        } else {
          setConvertedFileId(null);
        }
      } else {
        throw new Error('변환 결과를 받을 수 없습니다.');
      }
    } catch (err) {
      console.error('캐릭터 변환 실패:', err);
      const errorMessage = err instanceof Error ? err.message : '캐릭터 변환에 실패했습니다.';
      setError(errorMessage);
    } finally {
      setConvertingCharacter(false);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    setModelError(null);

    // 이미지 파일인지 확인
    const isImage = file.type.startsWith('image/');
    // GLB 파일인지 확인
    const isGLB = file.name.toLowerCase().endsWith('.glb');

    if (!isImage && !isGLB) {
      setError('이미지 파일 또는 GLB 파일만 업로드할 수 있습니다.');
      return;
    }

    if (isImage) {
      // 이미지 파일인 경우 GLB로 변환
      setConverting(true);
      setFileName(file.name);

      try {
        // SAM3D API를 통해 이미지를 GLB로 변환
        const glbBlob = await SAM3DService.convertImageToGLB(file);
        
        // 변환된 GLB를 Blob URL로 변환
        const url = URL.createObjectURL(glbBlob);
        setFileUrl(url);
        setFileName(`${file.name.replace(/\.[^/.]+$/, '')}.glb`);
      } catch (err) {
        console.error('이미지 변환 실패:', err);
        const errorMessage = err instanceof Error ? err.message : '이미지 변환에 실패했습니다.';
        setError(errorMessage);
        setFileName('');
      } finally {
        setConverting(false);
      }
    } else if (isGLB) {
      // GLB 파일인 경우 직접 로드
      setLoading(true);

      try {
        // 파일을 Blob URL로 변환
        const url = URL.createObjectURL(file);
        setFileUrl(url);
        setFileName(file.name);
      } catch (err) {
        console.error('파일 로드 실패:', err);
        setError('파일을 로드하는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'model/gltf-binary': ['.glb'],
    },
    multiple: false,
  });

  const handleClear = () => {
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
    }
    setFileUrl(null);
    setFileName('');
    setError(null);
    setModelError(null);
  };

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">캐릭터 자세 만들기</h1>
                {fileUrl && (
                  <Button variant="outline" size="sm" onClick={handleClear} className="gap-2">
                    <X className="h-4 w-4" />
                    파일 제거
                  </Button>
                )}
              </div>

              {/* 캐릭터 선택 섹션 */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4">
                    {!webtoonId ? (
                      <p className="text-sm text-muted-foreground">
                        캐릭터 변환 기능을 사용하려면 웹툰을 선택해주세요.
                      </p>
                    ) : characters.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        이 웹툰에 등록된 캐릭터가 없습니다. 캐릭터 관리에서 캐릭터를 추가해주세요.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium">캐릭터 선택</label>
                          <Select
                            value={selectedCharacter?.id || ''}
                            onValueChange={(value) => {
                              const character = characters.find(c => c.id === value);
                              setSelectedCharacter(character || null);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="캐릭터를 선택하세요" />
                            </SelectTrigger>
                            <SelectContent>
                              {characters.map((character) => (
                                <SelectItem key={character.id} value={character.id}>
                                  {character.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedCharacter && (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">캐릭터 시트 선택</label>
                            {selectedCharacter.character_sheets && selectedCharacter.character_sheets.length > 0 ? (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {selectedCharacter.character_sheets.map((sheet) => (
                                  <button
                                    key={sheet.id}
                                    onClick={() => setSelectedSheet(sheet)}
                                    className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                                      selectedSheet?.id === sheet.id
                                        ? 'border-primary ring-2 ring-primary/20'
                                        : 'border-border hover:border-primary/50'
                                    }`}
                                  >
                                    <Image
                                      src={sheet.file_path}
                                      alt={sheet.file_name}
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                이 캐릭터에 등록된 시트가 없습니다.
                              </p>
                            )}
                          </div>
                        )}

                        {error && (
                          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                            <p className="text-sm text-destructive">{error}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 하단: 뷰어와 변환 결과 */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                {/* 좌측: 3D 뷰어 */}
                <div className="flex flex-col gap-2">
                  <div 
                    className={`w-full rounded-lg border border-border overflow-hidden bg-muted/10 ${
                      aspectRatio === 'landscape' ? 'h-[400px]' : 
                      aspectRatio === 'square' ? 'h-[600px]' : 
                      'h-[800px]'
                    }`}
                  >
                  {!fileUrl && !converting ? (
                    <div
                      {...getRootProps()}
                      className={`w-full h-full border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                        isDragActive
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <Upload className="h-12 w-12 mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium mb-2">
                        {isDragActive ? '파일을 놓아주세요' : '원하는 자세의 사진을 업로드하세요'}
                      </p>
                      <p className="text-sm text-muted-foreground mb-2">
                        드래그 앤 드롭하거나 클릭하여 파일을 선택하세요
                      </p>
                      {error && (
                        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <p className="text-sm text-destructive">{error}</p>
                        </div>
                      )}
                    </div>
                  ) : converting ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                      <Loader2 className="h-12 w-12 mb-4 animate-spin text-primary" />
                      <p className="text-lg font-medium mb-2">이미지를 GLB로 변환하는 중...</p>
                      <p className="text-sm text-muted-foreground">
                        {fileName && `파일: ${fileName}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        변환에는 시간이 걸릴 수 있습니다. 잠시만 기다려주세요.
                      </p>
                      {error && (
                        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <p className="text-sm text-destructive">{error}</p>
                        </div>
                      )}
                    </div>
                  ) : modelError ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8">
                      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                      <p className="text-sm text-destructive text-center mb-4">{modelError}</p>
                      <Button variant="outline" size="sm" onClick={handleClear}>
                        파일 제거
                      </Button>
                    </div>
                  ) : loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : fileUrl ? (
                    <Suspense
                      fallback={
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      }
                    >
                      <Viewer3D 
                        fileUrl={fileUrl} 
                        onError={handleModelError}
                        onCaptureReady={handleSetCaptureFn}
                        onClear={handleClear}
                      />
                    </Suspense>
                  ) : null}
                  </div>
                  {/* 비율 선택 버튼 - 3D 뷰어 아래 */}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant={aspectRatio === 'landscape' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAspectRatio('landscape')}
                      title="가로길게 (16:9)"
                      className="gap-2"
                    >
                      <RectangleHorizontal className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={aspectRatio === 'square' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAspectRatio('square')}
                      title="정사각 (1:1)"
                      className="gap-2"
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={aspectRatio === 'portrait' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAspectRatio('portrait')}
                      title="세로길게 (9:16)"
                      className="gap-2"
                    >
                      <RectangleVertical className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* 추가 프롬프트 입력 필드 */}
                  {fileUrl && (
                    <div className="flex flex-col gap-2">
                      <label htmlFor="additional-prompt" className="text-sm font-medium">
                        추가 프롬프트 (옵션)
                      </label>
                      <Textarea
                        id="additional-prompt"
                        placeholder="예: 환희에 차서 기뻐한다"
                        value={additionalPrompt}
                        onChange={(e) => setAdditionalPrompt(e.target.value)}
                        className="min-h-[80px] resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        자세만으로는 상황을 정확히 파악하기 어려울 때 추가 설명을 입력하세요.
                      </p>
                    </div>
                  )}
                </div>

                {/* 중앙: 미리보기 버튼과 변환 버튼 */}
                <div className="flex flex-col items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (!captureFnRef.current) {
                        console.error('[Viewer3DPage] 캡처 함수가 없습니다');
                        return;
                      }
                      
                      try {
                        const capturedDataUrl = captureFnRef.current();
                        console.log('[Viewer3DPage] 캡처 완료, 데이터 URL 길이:', capturedDataUrl?.length);
                        
                        if (capturedDataUrl) {
                          setCapturedPoseImage(capturedDataUrl);
                          setPreviewOpen(true);
                        } else {
                          console.error('[Viewer3DPage] 캡처된 이미지가 없습니다');
                        }
                      } catch (error) {
                        console.error('[Viewer3DPage] 캡처 오류:', error);
                      }
                    }}
                    disabled={!captureFnReady || !fileUrl}
                    title="미리보기"
                    className="rounded-full h-10 w-10"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleConvertCharacter}
                    disabled={convertingCharacter || !captureFnReady || !selectedSheet || !fileUrl}
                    size="icon"
                    className="rounded-full h-12 w-12"
                    title={!fileUrl ? '파일을 업로드해주세요' : !captureFnReady ? '캡처 함수가 준비되지 않았습니다' : !selectedSheet ? '캐릭터 시트를 선택해주세요' : '3D 자세로 변환'}
                  >
                    {convertingCharacter ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-5 w-5" />
                    )}
                  </Button>
                </div>

                {/* 우측: 변환 결과 */}
                <div className="flex flex-col gap-2">
                  <div 
                    className={`w-full rounded-lg border border-border overflow-hidden bg-muted/10 ${
                      aspectRatio === 'landscape' ? 'h-[400px]' : 
                      aspectRatio === 'square' ? 'h-[600px]' : 
                      'h-[800px]'
                    }`}
                  >
                    {convertedImage ? (
                      <div className="relative w-full h-full">
                        <Image
                          src={convertedImage}
                          alt="변환된 캐릭터"
                          fill
                          className="object-contain rounded"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                        <p className="text-sm text-muted-foreground">
                          변환된 결과가 여기에 표시됩니다.
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          캐릭터를 선택하고 변환 버튼을 클릭하세요.
                        </p>
                      </div>
                    )}
                  </div>
                  {/* 저장하기 버튼 - 이미지 아래 */}
                  {convertedFileId && (
                    <Button
                      onClick={async () => {
                        if (!convertedFileId) return;
                        
                        setSavingImage(true);
                        try {
                          // URL 파라미터에서 cutId, episodeId 가져오기
                          const cutIdFromUrl = searchParams.get('cutId');
                          const episodeIdFromUrl = searchParams.get('episodeId');
                          
                          const response = await fetch('/api/regenerate-image-save', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              fileId: convertedFileId,
                              cutId: cutIdFromUrl || selectedCut?.id,
                              episodeId: episodeIdFromUrl || episodeId,
                            }),
                          });

                          if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || '이미지 저장에 실패했습니다.');
                          }

                          alert('이미지가 정식 공정에 저장되었습니다.');
                          setConvertedFileId(null); // 저장 완료 후 버튼 숨김
                        } catch (err) {
                          console.error('이미지 저장 실패:', err);
                          const errorMessage = err instanceof Error ? err.message : '이미지 저장에 실패했습니다.';
                          alert(errorMessage);
                        } finally {
                          setSavingImage(false);
                        }
                      }}
                      disabled={savingImage}
                      size="sm"
                      className="gap-2 self-end"
                    >
                      {savingImage ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          저장하기
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* API 전달 내용 미리보기 Dialog */}
              <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>API 전달 내용 미리보기</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    {/* 프롬프트 */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">프롬프트</label>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">
                          이미지1의 캐릭터를 이미지2의 자세와 구도로 그려주세요. 캐릭터의 특징과 디자인은 이미지1을 정확히 따르되, 자세와 구도는 이미지2와 동일하게 해주세요.
                        </p>
                      </div>
                    </div>

                    {/* 이미지1: 캐릭터 시트 */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">이미지1: 캐릭터 시트</label>
                      {selectedSheet && (
                        <div className="border rounded-lg p-4 bg-muted/10">
                          <div className="relative w-full aspect-square max-w-md mx-auto">
                            <Image
                              src={selectedSheet.file_path}
                              alt={selectedSheet.file_name}
                              fill
                              className="object-contain rounded"
                              unoptimized
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            {selectedSheet.file_name}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 이미지2: 3D 뷰어 캡처 */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">이미지2: 3D 뷰어 캡처 (자세/구도)</label>
                      {capturedPoseImage ? (
                        <div className="border rounded-lg p-4 bg-muted/10">
                          <div className="relative w-full aspect-square max-w-md mx-auto">
                            <Image
                              src={capturedPoseImage}
                              alt="3D 뷰어 캡처"
                              fill
                              className="object-contain rounded"
                              unoptimized
                              onError={() => {
                                console.error('[Dialog] 이미지 로딩 실패:', capturedPoseImage.substring(0, 50));
                                console.error('[Dialog] capturedPoseImage 상태:', !!capturedPoseImage);
                              }}
                              onLoad={() => {
                                console.log('[Dialog] 이미지 로딩 성공');
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            캡처된 이미지 (크기: {capturedPoseImage.length > 0 ? `${(capturedPoseImage.length / 1024).toFixed(2)}KB` : '알 수 없음'})
                          </p>
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 bg-muted/10">
                          <p className="text-sm text-muted-foreground text-center">
                            미리보기 버튼을 클릭하여 3D 뷰어를 캡처하세요.
                          </p>
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            (현재 상태: {capturedPoseImage === null ? 'null' : '설정됨'})
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Viewer3DPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="bg-background min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Viewer3DPage />
    </Suspense>
  );
}

