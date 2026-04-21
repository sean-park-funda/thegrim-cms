'use client';

import { useState } from 'react';
import { settlementFetch } from '@/lib/settlement/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';

interface GlobalLaunch {
  id: string;
  work_id?: string;
  country_code: string;
  platform_name: string | null;
  url: string | null;
  status: string;
  launched_at: string | null;
  note: string | null;
}

const COUNTRIES = [
  { code: 'US', label: '북미', flag: '🇺🇸' },
  { code: 'JP', label: '일본', flag: '🇯🇵' },
  { code: 'TW', label: '대만', flag: '🇹🇼' },
  { code: 'CN', label: '중국', flag: '🇨🇳' },
  { code: 'ID', label: '인도네시아', flag: '🇮🇩' },
  { code: 'FR', label: '프랑스', flag: '🇫🇷' },
  { code: 'DE', label: '독일', flag: '🇩🇪' },
  { code: 'TH', label: '태국', flag: '🇹🇭' },
  { code: 'ES', label: '스페인', flag: '🇪🇸' },
  { code: 'IT', label: '이탈리아', flag: '🇮🇹' },
  { code: 'BR', label: '브라질', flag: '🇧🇷' },
  { code: 'OTHER', label: '기타', flag: '🌐' },
];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  planned: { label: '예정', variant: 'outline' },
  live: { label: '서비스중', variant: 'default' },
  ended: { label: '종료', variant: 'secondary' },
};

interface Props {
  workId: string;
  launches: GlobalLaunch[];
  canManage: boolean;
  onReload: () => void;
}

export function GlobalLaunchesTab({ workId, launches, canManage, onReload }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GlobalLaunch | null>(null);
  const [saving, setSaving] = useState(false);

  const [countryCode, setCountryCode] = useState('');
  const [platformName, setPlatformName] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('live');
  const [launchedAt, setLaunchedAt] = useState('');
  const [note, setNote] = useState('');

  const openCreate = () => {
    setEditing(null);
    setCountryCode('');
    setPlatformName('');
    setUrl('');
    setStatus('live');
    setLaunchedAt('');
    setNote('');
    setDialogOpen(true);
  };

  const openEdit = (l: GlobalLaunch) => {
    setEditing(l);
    setCountryCode(l.country_code);
    setPlatformName(l.platform_name || '');
    setUrl(l.url || '');
    setStatus(l.status);
    setLaunchedAt(l.launched_at || '');
    setNote(l.note || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!countryCode) return;
    setSaving(true);
    try {
      const payload = {
        country_code: countryCode,
        platform_name: platformName || null,
        url: url || null,
        status,
        launched_at: launchedAt || null,
        note: note || null,
      };

      if (editing) {
        await settlementFetch(`/api/works/${workId}/global-launches`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
      } else {
        await settlementFetch(`/api/works/${workId}/global-launches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      onReload();
    } catch (e) {
      console.error('저장 오류:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('해외 론칭 정보를 삭제하시겠습니까?')) return;
    await settlementFetch(`/api/works/${workId}/global-launches`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    onReload();
  };

  const getCountry = (code: string) => COUNTRIES.find((c) => c.code === code);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">국가별 서비스 현황 및 링크</p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            추가
          </Button>
        )}
      </div>

      {launches.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">등록된 해외 론칭 정보가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {launches.map((l) => {
            const country = getCountry(l.country_code);
            const st = STATUS_MAP[l.status] || STATUS_MAP.planned;
            return (
              <Card key={l.id} className="relative group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{country?.flag || '🌐'}</span>
                      <div>
                        <div className="font-medium text-sm">{country?.label || l.country_code}</div>
                        {l.platform_name && (
                          <div className="text-xs text-muted-foreground">{l.platform_name}</div>
                        )}
                      </div>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  {l.launched_at && (
                    <div className="text-xs text-muted-foreground mt-2">론칭일: {l.launched_at}</div>
                  )}
                  {l.url && (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      링크
                    </a>
                  )}
                  {l.note && <p className="text-xs text-muted-foreground mt-2">{l.note}</p>}
                  {canManage && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(l.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '해외 론칭 수정' : '해외 론칭 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>국가</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger><SelectValue placeholder="국가 선택" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.flag} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>플랫폼명</Label>
              <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} placeholder="예: LINE Manga, Webtoon" />
            </div>
            <div className="space-y-2">
              <Label>서비스 URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>상태</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">예정</SelectItem>
                    <SelectItem value="live">서비스중</SelectItem>
                    <SelectItem value="ended">종료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>론칭일</Label>
                <Input type="date" value={launchedAt} onChange={(e) => setLaunchedAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleSave} disabled={!countryCode || saving}>
                {saving ? '저장 중...' : editing ? '수정' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
