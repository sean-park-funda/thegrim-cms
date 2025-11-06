'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getCuts } from '@/lib/api/cuts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Image } from 'lucide-react';
import { Cut } from '@/lib/supabase';

export function CutList() {
  const { selectedEpisode, selectedCut, setSelectedCut } = useStore();
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedEpisode) {
      loadCuts();
    } else {
      setCuts([]);
    }
  }, [selectedEpisode]);

  const loadCuts = async () => {
    if (!selectedEpisode) return;

    try {
      setLoading(true);
      const data = await getCuts(selectedEpisode.id);
      setCuts(data);
    } catch (error) {
      console.error('컷 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedEpisode) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>회차를 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">컷 목록</h2>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          새 컷
        </Button>
      </div>

      {cuts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>등록된 컷이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cuts.map((cut) => (
            <Card key={cut.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedCut?.id === cut.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedCut(cut)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  컷 {cut.cut_number}
                  {cut.title && ` - ${cut.title}`}
                </CardTitle>
              </CardHeader>
              {cut.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">{cut.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


