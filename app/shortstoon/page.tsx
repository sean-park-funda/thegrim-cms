'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Film, Trash2, Loader2, Clapperboard } from 'lucide-react';
import { ShortstoonProject } from '@/lib/supabase';

export default function ShortstoonListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ShortstoonProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/shortstoon');
    const data = await res.json();
    setProjects(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/shortstoon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_project', name: newName.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.id) {
      router.push(`/shortstoon/${data.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 숏스툰 프로젝트를 삭제할까요?')) return;
    setDeletingId(id);
    await fetch(`/api/shortstoon?projectId=${id}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">숏스툰</h1>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4 mr-1" />
            새 프로젝트
          </Button>
        </div>

        {/* 새 프로젝트 폼 */}
        {showForm && (
          <div className="flex gap-2 p-4 rounded-lg border bg-muted/30">
            <Input
              placeholder="프로젝트 이름"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="text-sm"
              autoFocus
            />
            <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : '만들기'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setNewName(''); }}>
              취소
            </Button>
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">프로젝트가 없습니다</p>
            <p className="text-xs mt-1">위에서 새 프로젝트를 만들어보세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => router.push(`/shortstoon/${p.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                  disabled={deletingId === p.id}
                >
                  {deletingId === p.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
