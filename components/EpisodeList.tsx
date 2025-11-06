'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getEpisodes } from '@/lib/api/episodes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, BookOpen } from 'lucide-react';
import { Episode } from '@/lib/supabase';

export function EpisodeList() {
  const { selectedWebtoon, selectedEpisode, setSelectedEpisode } = useStore();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedWebtoon) {
      loadEpisodes();
    } else {
      setEpisodes([]);
    }
  }, [selectedWebtoon]);

  const loadEpisodes = async () => {
    if (!selectedWebtoon) return;

    try {
      setLoading(true);
      const data = await getEpisodes(selectedWebtoon.id);
      setEpisodes(data);
    } catch (error) {
      console.error('회차 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedWebtoon) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>웹툰을 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{selectedWebtoon.title} - 회차</h2>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          새 회차
        </Button>
      </div>

      {episodes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>등록된 회차가 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {episodes.map((episode) => (
            <Card key={episode.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedEpisode?.id === episode.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedEpisode(episode)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">
                    {episode.episode_number}화 - {episode.title}
                  </CardTitle>
                  <Badge variant={episode.status === 'completed' ? 'default' : episode.status === 'in_progress' ? 'secondary' : 'outline'}>
                    {episode.status === 'completed' ? '완료' : episode.status === 'in_progress' ? '진행중' : '대기'}
                  </Badge>
                </div>
              </CardHeader>
              {episode.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">{episode.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


