'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SessionList } from '@/components/free-creation';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store/useStore';
import {
  getFreeCreationSessions,
  createFreeCreationSession,
  updateFreeCreationSession,
  deleteFreeCreationSession,
} from '@/lib/api/freeCreation';
import { FreeCreationSessionWithStats } from '@/lib/supabase';

function FreeCreationContent() {
  const searchParams = useSearchParams();
  const webtoonId = searchParams.get('webtoonId');
  const { profile } = useStore();

  const [sessions, setSessions] = useState<FreeCreationSessionWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!webtoonId) return;

    try {
      setLoading(true);
      const data = await getFreeCreationSessions(webtoonId, undefined, true);
      setSessions(data);
    } catch (error) {
      console.error('[자유창작] 세션 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [webtoonId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = useCallback(
    async (title: string) => {
      if (!webtoonId || !profile?.id) return;
      await createFreeCreationSession(webtoonId, profile.id, title);
      await loadSessions();
    },
    [webtoonId, profile?.id, loadSessions]
  );

  const handleEditSession = useCallback(
    async (sessionId: string, title: string) => {
      await updateFreeCreationSession(sessionId, title);
      await loadSessions();
    },
    [loadSessions]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteFreeCreationSession(sessionId);
      await loadSessions();
    },
    [loadSessions]
  );

  if (!webtoonId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">웹툰을 선택해주세요.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile?.id) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">로그인이 필요합니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <SessionList
        sessions={sessions}
        currentUserId={profile.id}
        webtoonId={webtoonId}
        onCreateSession={handleCreateSession}
        onEditSession={handleEditSession}
        onDeleteSession={handleDeleteSession}
        loading={loading}
      />
    </div>
  );
}

export default function FreeCreationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <FreeCreationContent />
    </Suspense>
  );
}
