'use client';

import { useState, useCallback } from 'react';
import { FreeCreationSessionWithStats } from '@/lib/supabase';
import { SessionCard } from './SessionCard';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SessionListProps {
  sessions: FreeCreationSessionWithStats[];
  currentUserId: string;
  webtoonId: string;
  onCreateSession: (title: string) => Promise<void>;
  onEditSession: (sessionId: string, title: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  loading?: boolean;
}

export function SessionList({
  sessions,
  currentUserId,
  webtoonId,
  onCreateSession,
  onEditSession,
  onDeleteSession,
  loading,
}: SessionListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [editingSession, setEditingSession] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 내 세션과 다른 사람 세션 분리
  const mySessions = sessions.filter((s) => s.user_id === currentUserId);
  const otherSessions = sessions.filter((s) => s.user_id !== currentUserId);

  const handleCreateClick = () => {
    setNewSessionTitle('');
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!newSessionTitle.trim()) return;

    try {
      setIsSubmitting(true);
      await onCreateSession(newSessionTitle.trim());
      setCreateDialogOpen(false);
      setNewSessionTitle('');
    } catch (error) {
      console.error('[세션 목록] 생성 실패:', error);
      alert(error instanceof Error ? error.message : '세션 생성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (sessionId: string, currentTitle: string) => {
    setEditingSession({ id: sessionId, title: currentTitle });
    setEditTitle(currentTitle);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingSession || !editTitle.trim()) return;

    try {
      setIsSubmitting(true);
      await onEditSession(editingSession.id, editTitle.trim());
      setEditDialogOpen(false);
      setEditingSession(null);
      setEditTitle('');
    } catch (error) {
      console.error('[세션 목록] 수정 실패:', error);
      alert(error instanceof Error ? error.message : '세션 수정에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await onDeleteSession(sessionId);
    } catch (error) {
      console.error('[세션 목록] 삭제 실패:', error);
      alert(error instanceof Error ? error.message : '세션 삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between">
        <h1 className="text-2xl font-bold">자유창작 세션</h1>
        <Button onClick={handleCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          새 세션 만들기
        </Button>
      </div>

      {/* 세션 목록 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 내 세션 */}
        {mySessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">내 세션</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {mySessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isOwner={true}
                  onEdit={handleEditClick}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}

        {/* 다른 사람 세션 */}
        {otherSessions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">다른 사람의 세션</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {otherSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isOwner={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* 빈 상태 */}
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground mb-4">아직 세션이 없습니다.</p>
            <Button onClick={handleCreateClick}>
              <Plus className="h-4 w-4 mr-2" />
              첫 세션 만들기
            </Button>
          </div>
        )}
      </div>

      {/* 새 세션 생성 다이얼로그 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 세션 만들기</DialogTitle>
            <DialogDescription>
              자유창작을 위한 새 세션을 만듭니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-title">세션 이름</Label>
              <Input
                id="session-title"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="예: 캐릭터 디자인"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button onClick={handleCreateSubmit} disabled={isSubmitting || !newSessionTitle.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                '만들기'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 세션 이름 변경 다이얼로그 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>세션 이름 변경</DialogTitle>
            <DialogDescription>
              세션의 이름을 변경합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">세션 이름</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="세션 이름"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleEditSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button onClick={handleEditSubmit} disabled={isSubmitting || !editTitle.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
