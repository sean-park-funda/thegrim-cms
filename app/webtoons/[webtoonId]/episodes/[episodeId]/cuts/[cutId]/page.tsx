'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { FileGridWithSuspense } from '@/components/FileGridWithSuspense';
import { CutList } from '@/components/CutList';
import { getEpisodeWithCuts } from '@/lib/api/episodes';
import { EpisodeWithCuts, Cut } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store/useStore';

export default function CutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSelectedWebtoon, setSelectedEpisode, setSelectedCut } = useStore();
  const webtoonId = params.webtoonId as string;
  const episodeId = params.episodeId as string;
  const cutId = params.cutId as string;
  const [episode, setEpisode] = useState<EpisodeWithCuts | null>(null);
  const [loading, setLoading] = useState(true);

  const unitType = episode?.webtoon?.unit_type || 'cut';
  const unitLabel = unitType === 'cut' ? '컷' : '페이지';
  const sortedCuts = episode?.cuts ? [...episode.cuts].sort((a, b) => a.cut_number - b.cut_number) : [];
  const selectedCut = sortedCuts.find(c => c.id === cutId);

  const handleCutChange = (newCutId: string) => {
    // 현재 선택된 공정(process) 파라미터 유지
    const currentProcess = searchParams.get('process');
    const url = `/webtoons/${webtoonId}/episodes/${episodeId}/cuts/${newCutId}`;
    const urlWithProcess = currentProcess ? `${url}?process=${currentProcess}` : url;
    router.push(urlWithProcess);
  };

  useEffect(() => {
    const loadEpisode = async () => {
      try {
        setLoading(true);
        const data = await getEpisodeWithCuts(episodeId);
        setEpisode(data);
        
        // 브레드크럼 네비게이션을 위해 store에 상태 설정
        if (data) {
          setSelectedWebtoon(data.webtoon || null);
          setSelectedEpisode(data);
          // 선택된 컷 설정
          const selectedCut = data.cuts?.find(c => c.id === cutId);
          if (selectedCut) {
            setSelectedCut(selectedCut);
          }
        }
      } catch (error) {
        console.error('회차 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    if (episodeId) {
      loadEpisode();
    }
  }, [episodeId, cutId, setSelectedWebtoon, setSelectedEpisode, setSelectedCut]);

  return (
    <div className="flex-1 h-full bg-background relative">
      {/* FileGridWithSuspense를 항상 렌더링하여 hooks 호출 순서 일관성 유지 */}
      <div className="hidden lg:grid lg:grid-cols-12 h-full">
        {episode && (
          <div className="col-span-2 border-r border-border/40 h-full bg-background">
            <Suspense fallback={<div className="p-4 text-center text-muted-foreground text-sm">로딩 중...</div>}>
              <CutList episode={episode} selectedCutId={cutId} />
            </Suspense>
          </div>
        )}
        <div className={`h-full bg-background ${episode ? 'col-span-10' : 'col-span-12'}`}>
          <FileGridWithSuspense cutId={cutId} />
        </div>
      </div>

      {/* 모바일: 세로 스택 레이아웃 */}
      <div className="lg:hidden flex flex-col h-full">
        {episode && sortedCuts.length > 0 && (
          <div className="flex-shrink-0 border-b border-border/40 bg-background p-3">
            <Select value={cutId} onValueChange={handleCutChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedCut
                    ? `${unitLabel} ${selectedCut.cut_number}${selectedCut.title ? ` - ${selectedCut.title}` : ''}`
                    : `${unitLabel} 선택`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sortedCuts.map((cut) => (
                  <SelectItem key={cut.id} value={cut.id}>
                    {unitLabel} {cut.cut_number}
                    {cut.title && ` - ${cut.title}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex-1 bg-background">
          <FileGridWithSuspense cutId={cutId} />
        </div>
      </div>

      {/* 로딩/에러 오버레이 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-20">
          <div className="text-muted-foreground text-sm">로딩 중...</div>
        </div>
      )}
      {!loading && !episode && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-20">
          <div className="text-muted-foreground text-sm">회차를 찾을 수 없습니다.</div>
        </div>
      )}
    </div>
  );
}

