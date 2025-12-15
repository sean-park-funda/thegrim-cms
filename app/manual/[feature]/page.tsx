'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, CheckCircle2, Edit, Upload, X, Loader2 } from 'lucide-react';
import {
  getFeatureById,
  getGroupById,
  manualFeatures,
} from '@/lib/constants/manual';

export default function ManualFeaturePage() {
  const params = useParams();
  const featureId = params.feature as string;
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImages, setCurrentImages] = useState<string[]>([]);

  const feature = getFeatureById(featureId);
  const group = feature ? getGroupById(feature.groupId) : null;

  // 이미지 목록 초기화
  useEffect(() => {
    if (feature?.images) {
      setCurrentImages(feature.images);
    }
  }, [feature]);

  if (!feature) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">기능을 찾을 수 없습니다</h1>
          <p className="text-muted-foreground mb-6">
            요청하신 기능의 매뉴얼이 존재하지 않습니다.
          </p>
          <Link href="/manual">
            <Button>매뉴얼 목록으로 돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  const FeatureIcon = feature.icon;
  const GroupIcon = group?.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/manual">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {GroupIcon && (
                  <GroupIcon className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {group?.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <FeatureIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{feature.name}</h1>
                  <p className="text-muted-foreground mt-2">{feature.description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 주요 기능 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>주요 기능</CardTitle>
            <CardDescription>
              이 기능에서 제공하는 모든 기능 목록입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {feature.details.map((detail, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{detail}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 스크린샷 */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>스크린샷</CardTitle>
                <CardDescription>
                  이 기능의 실제 사용 화면입니다.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUploadDialogOpen(true)}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                수정
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {currentImages.length > 0 ? (
              <div className="space-y-4">
                {currentImages.map((image, index) => (
                  <div key={index} className="rounded-lg border overflow-hidden bg-muted/10 relative group">
                    <div className="relative w-full aspect-video">
                      <Image
                        src={`/manual/${image}`}
                        alt={`${feature.name} 스크린샷 ${index + 1}`}
                        fill
                        className="object-contain"
                        unoptimized
                        onError={() => {
                          // 이미지 로드 실패 시 목록에서 제거
                          setCurrentImages((prev) => prev.filter((_, i) => i !== index));
                        }}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        setUploadingIndex(index);
                        setUploadDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>스크린샷이 없습니다. 수정 버튼을 클릭하여 이미지를 추가하세요.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 이미지 업로드 다이얼로그 */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>스크린샷 업로드</DialogTitle>
              <DialogDescription>
                이미지를 업로드하거나 클립보드에서 붙여넣기(Ctrl+V / Cmd+V)할 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            <ImageUploadDialog
              featureId={featureId}
              imageIndex={uploadingIndex}
              onUploadComplete={(filename) => {
                if (uploadingIndex !== null) {
                  // 특정 인덱스의 이미지 교체
                  setCurrentImages((prev) => {
                    const newImages = [...prev];
                    newImages[uploadingIndex] = filename;
                    return newImages;
                  });
                } else {
                  // 새 이미지 추가
                  setCurrentImages((prev) => [...prev, filename]);
                }
                setUploadDialogOpen(false);
                setUploadingIndex(null);
              }}
              onClose={() => {
                setUploadDialogOpen(false);
                setUploadingIndex(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* 사용 방법 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>사용 방법</CardTitle>
            <CardDescription>
              이 기능을 사용하는 방법에 대한 안내입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {getUsageGuide(featureId)}
            </div>
          </CardContent>
        </Card>

        {/* 관련 기능 */}
        <Card>
          <CardHeader>
            <CardTitle>관련 기능</CardTitle>
            <CardDescription>
              이 기능과 함께 사용하면 유용한 다른 기능들입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {getRelatedFeatures(featureId).map((relatedFeature) => (
                <Link
                  key={relatedFeature.id}
                  href={`/manual/${relatedFeature.id}`}
                >
                  <Card className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const RelatedIcon = relatedFeature.icon;
                          return (
                            <RelatedIcon className="h-5 w-5 text-primary flex-shrink-0" />
                          );
                        })()}
                        <div>
                          <p className="font-medium text-sm">{relatedFeature.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {relatedFeature.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 사용 방법 가이드 함수
function getUsageGuide(featureId: string): React.ReactNode {
  const guides: Record<string, React.ReactNode> = {
    'webtoon-management': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">웹툰 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>웹툰 목록에서 "새 웹툰 추가" 버튼을 클릭합니다.</li>
            <li>웹툰 제목과 설명을 입력합니다.</li>
            <li>저장 버튼을 클릭하여 웹툰을 생성합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">회차 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>웹툰을 선택한 후 회차 목록에서 "새 회차 추가" 버튼을 클릭합니다.</li>
            <li>회차 번호, 제목, 설명을 입력합니다.</li>
            <li>저장 버튼을 클릭하여 회차를 생성합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">컷 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>회차를 선택한 후 컷 목록에서 "새 컷 추가" 버튼을 클릭합니다.</li>
            <li>컷 번호, 제목, 설명을 입력합니다.</li>
            <li>저장 버튼을 클릭하여 컷을 생성합니다.</li>
          </ol>
        </div>
      </div>
    ),
    'process-management': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">공정 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>공정별 뷰에서 "새 공정 추가" 버튼을 클릭합니다.</li>
            <li>공정 이름, 설명, 색상을 설정합니다.</li>
            <li>저장 버튼을 클릭하여 공정을 생성합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">공정 순서 변경</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>공정 목록에서 화살표 버튼을 사용하여 순서를 변경합니다.</li>
            <li>위로 이동: ↑ 버튼 클릭</li>
            <li>아래로 이동: ↓ 버튼 클릭</li>
          </ol>
        </div>
      </div>
    ),
    'file-management': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">파일 업로드</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>드래그 앤 드롭: 파일을 파일 그리드 영역에 드래그하여 놓습니다.</li>
            <li>클립보드 붙여넣기: Ctrl+V (Windows) 또는 Cmd+V (Mac)를 누릅니다.</li>
            <li>파일 선택: 업로드 버튼을 클릭하여 파일을 선택합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">파일 다운로드</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>파일 카드에서 다운로드 버튼을 클릭합니다.</li>
            <li>또는 파일 상세 정보 다이얼로그에서 다운로드 버튼을 클릭합니다.</li>
          </ol>
        </div>
      </div>
    ),
    'reference-files': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">레퍼런스 파일 업로드</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>파일 그리드에서 "레퍼런스 파일" 버튼을 클릭합니다.</li>
            <li>공정을 선택합니다.</li>
            <li>파일을 드래그 앤 드롭하거나 선택합니다.</li>
            <li>설명을 입력하고 업로드합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">레퍼런스 파일 활용</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>AI 이미지 재생성 시 "톤먹 넣기" 스타일을 선택합니다.</li>
            <li>레퍼런스 이미지를 선택합니다.</li>
            <li>재생성 버튼을 클릭하여 레퍼런스 이미지의 톤과 명암을 적용합니다.</li>
          </ol>
        </div>
      </div>
    ),
    'search': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">파일 검색</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>상단 네비게이션 바의 검색 입력 필드에 검색어를 입력합니다.</li>
            <li>Enter 키를 누르거나 검색 버튼을 클릭합니다.</li>
            <li>검색 결과에서 파일을 클릭하여 상세 정보를 확인합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">검색 범위</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>파일명</li>
            <li>파일 설명</li>
            <li>메타데이터 (장면 요약, 태그)</li>
          </ul>
        </div>
      </div>
    ),
    'ai-image-analysis': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">자동 분석</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>이미지 파일을 업로드하면 자동으로 분석이 시작됩니다.</li>
            <li>분석이 완료되면 메타데이터가 자동으로 추가됩니다.</li>
            <li>파일 상세 정보에서 분석 결과를 확인할 수 있습니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">수동 분석</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>파일 카드에서 "분석" 버튼을 클릭합니다.</li>
            <li>분석이 완료될 때까지 기다립니다.</li>
            <li>분석 결과는 파일 상세 정보에 표시됩니다.</li>
          </ol>
        </div>
      </div>
    ),
    'ai-image-regeneration': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">이미지 재생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>파일 카드에서 "다시그리기" 버튼을 클릭합니다.</li>
            <li>원하는 스타일을 선택합니다.</li>
            <li>레퍼런스 이미지를 선택합니다 (선택사항).</li>
            <li>프롬프트를 편집합니다 (선택사항).</li>
            <li>생성 장수를 설정하고 재생성 버튼을 클릭합니다.</li>
            <li>생성된 이미지 중 원하는 이미지를 선택하여 저장합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">배치 재생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>여러 이미지를 동시에 재생성할 수 있습니다.</li>
            <li>최대 4개씩 배치로 나누어 처리됩니다.</li>
            <li>각 배치가 완료되면 즉시 결과가 표시됩니다.</li>
          </ol>
        </div>
      </div>
    ),
    'monster-generator': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">몬스터 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>파일 그리드에서 "몬스터 생성기" 버튼을 클릭합니다.</li>
            <li>몬스터에 대한 설명을 입력합니다.</li>
            <li>AI 프롬프트 자동 생성 버튼을 클릭합니다 (선택사항).</li>
            <li>비율을 선택합니다 (가로/정사각/세로).</li>
            <li>생성 장수를 설정하고 생성 버튼을 클릭합니다.</li>
            <li>생성된 이미지 중 원하는 이미지를 선택하여 저장합니다.</li>
          </ol>
        </div>
      </div>
    ),
    'character-management': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">캐릭터 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>회차 목록 상단의 "캐릭터 관리" 버튼을 클릭합니다.</li>
            <li>"새 캐릭터 추가" 버튼을 클릭합니다.</li>
            <li>캐릭터 이름과 설명을 입력합니다.</li>
            <li>저장 버튼을 클릭하여 캐릭터를 생성합니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">캐릭터 시트 관리</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>캐릭터를 선택한 후 "시트 관리" 버튼을 클릭합니다.</li>
            <li>직접 업로드: 파일을 드래그 앤 드롭하거나 선택합니다.</li>
            <li>AI 생성: 프롬프트를 입력하고 생성 버튼을 클릭합니다.</li>
            <li>4방향 캐릭터 시트가 자동으로 생성됩니다.</li>
          </ol>
        </div>
      </div>
    ),
    'character-pose': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">3D 모델 로드</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>3D 뷰어 페이지로 이동합니다.</li>
            <li>GLB 파일을 드래그 앤 드롭하거나 선택합니다.</li>
            <li>또는 이미지 파일을 업로드하면 자동으로 GLB로 변환됩니다.</li>
            <li>3D 뷰어에서 모델을 회전하고 확대/축소하여 원하는 자세를 만듭니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">캐릭터 자세 생성</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>캐릭터를 선택합니다.</li>
            <li>캐릭터 시트를 선택합니다.</li>
            <li>3D 뷰어에서 원하는 자세를 조정합니다.</li>
            <li>비율을 선택합니다 (가로/정사각/세로).</li>
            <li>추가 프롬프트를 입력합니다 (선택사항).</li>
            <li>변환 버튼을 클릭하여 AI 이미지를 생성합니다.</li>
            <li>생성된 이미지를 확인하고 저장합니다.</li>
          </ol>
        </div>
      </div>
    ),
    'admin-features': (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">사용자 관리</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>관리자 페이지로 이동합니다.</li>
            <li>사용자 목록에서 사용자를 선택합니다.</li>
            <li>역할을 변경하거나 사용자를 삭제할 수 있습니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-2">사용자 초대</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>관리자 페이지에서 "초대 생성" 버튼을 클릭합니다.</li>
            <li>이메일 주소와 역할을 입력합니다.</li>
            <li>초대 링크가 생성되고 이메일이 발송됩니다.</li>
            <li>초대 링크를 복사하여 직접 전달할 수도 있습니다.</li>
          </ol>
        </div>
      </div>
    ),
  };

  return guides[featureId] || (
    <p className="text-sm text-muted-foreground">
      이 기능의 상세 사용 방법은 곧 추가될 예정입니다.
    </p>
  );
}

// 이미지 업로드 다이얼로그 컴포넌트
function ImageUploadDialog({
  featureId,
  imageIndex,
  onUploadComplete,
  onClose,
}: {
  featureId: string;
  imageIndex: number | null;
  onUploadComplete: (filename: string) => void;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteAreaFocused, setPasteAreaFocused] = useState(false);

  const feature = getFeatureById(featureId);
  const targetFilename = imageIndex !== null && feature?.images
    ? feature.images[imageIndex]
    : `${featureId}-${imageIndex !== null ? imageIndex + 1 : (feature?.images?.length || 0) + 1}.png`;

  // 클립보드 붙여넣기 처리
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!pasteAreaFocused) return;

      e.preventDefault();
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            await uploadImage(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [pasteAreaFocused]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', targetFilename);

      const response = await fetch('/api/manual/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '업로드 실패');
      }

      const data = await response.json();
      onUploadComplete(targetFilename);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      uploadImage(file);
    } else {
      setError('이미지 파일만 업로드할 수 있습니다.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        파일명: <span className="font-mono">{targetFilename}</span>
      </div>

      {/* 드래그 앤 드롭 영역 */}
      <div
        className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors hover:border-primary/50"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        onFocus={() => setPasteAreaFocused(true)}
        onBlur={() => setPasteAreaFocused(false)}
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-medium mb-2">이미지 업로드</p>
        <p className="text-sm text-muted-foreground mb-2">
          파일을 드래그 앤 드롭하거나 클릭하여 선택하세요
        </p>
        <p className="text-xs text-muted-foreground">
          또는 클립보드에서 붙여넣기 (Ctrl+V / Cmd+V)
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {uploading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>업로드 중...</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={uploading}>
          취소
        </Button>
      </div>
    </div>
  );
}

// 관련 기능 찾기 함수
function getRelatedFeatures(featureId: string) {
  const relatedMap: Record<string, string[]> = {
    'webtoon-management': ['file-management', 'process-management'],
    'process-management': ['file-management', 'webtoon-management'],
    'file-management': ['search', 'ai-image-analysis', 'webtoon-management'],
    'reference-files': ['file-management', 'ai-image-regeneration'],
    'search': ['file-management'],
    'ai-image-analysis': ['file-management', 'ai-image-regeneration'],
    'ai-image-regeneration': ['ai-image-analysis', 'reference-files', 'file-management'],
    'monster-generator': ['file-management', 'ai-image-regeneration'],
    'character-management': ['character-pose'],
    'character-pose': ['character-management', 'ai-image-regeneration'],
    'admin-features': [],
  };

  const relatedIds = relatedMap[featureId] || [];
  return manualFeatures.filter((feature) => relatedIds.includes(feature.id));
}

