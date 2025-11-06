'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getWebtoons } from '@/lib/api/webtoons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Film } from 'lucide-react';
import { Webtoon } from '@/lib/supabase';

export function WebtoonList() {
  const { webtoons, setWebtoons, selectedWebtoon, setSelectedWebtoon } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWebtoons();
  }, []);

  const loadWebtoons = async () => {
    try {
      setLoading(true);
      const data = await getWebtoons();
      setWebtoons(data);
    } catch (error) {
      console.error('웹툰 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">웹툰 목록</h2>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          새 웹툰
        </Button>
      </div>

      {webtoons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>등록된 웹툰이 없습니다.</p>
            <p className="text-sm mt-1">새 웹툰을 추가해주세요.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {webtoons.map((webtoon) => (
            <Card key={webtoon.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedWebtoon?.id === webtoon.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedWebtoon(webtoon)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{webtoon.title}</CardTitle>
                  <Badge variant={webtoon.status === 'active' ? 'default' : 'secondary'}>
                    {webtoon.status === 'active' ? '진행중' : '완료'}
                  </Badge>
                </div>
              </CardHeader>
              {webtoon.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">{webtoon.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


