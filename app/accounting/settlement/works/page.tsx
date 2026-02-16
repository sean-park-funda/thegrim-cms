'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { MonthSelector } from '@/components/settlement/MonthSelector';
import { WorkForm } from '@/components/settlement/WorkForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Link2 } from 'lucide-react';
import { RsWork, RsPartner, RsWorkPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  exclusive: '독점',
  non_exclusive: '비독점',
  management: '매니지먼트',
};

export default function WorksPage() {
  const router = useRouter();
  const { profile } = useStore();
  const [works, setWorks] = useState<RsWork[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [workPartners, setWorkPartners] = useState<RsWorkPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editWork, setEditWork] = useState<RsWork | null>(null);

  // Work-Partner linking dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkWorkId, setLinkWorkId] = useState('');
  const [linkPartnerId, setLinkPartnerId] = useState('');
  const [linkRate, setLinkRate] = useState('0.7');
  const [linkRole, setLinkRole] = useState('author');
  const [linkMg, setLinkMg] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const load = async () => {
    setLoading(true);
    try {
      const [workRes, partnerRes, wpRes] = await Promise.all([
        settlementFetch('/api/accounting/settlement/works?active=false'),
        settlementFetch('/api/accounting/settlement/partners'),
        settlementFetch('/api/accounting/settlement/work-partners'),
      ]);
      const workData = await workRes.json();
      const partnerData = await partnerRes.json();
      const wpData = await wpRes.json();
      setWorks(workData.works || []);
      setPartners(partnerData.partners || []);
      setWorkPartners(wpData.work_partners || []);
    } catch (e) {
      console.error('작품 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile]);

  const handleCreate = async (data: Partial<RsWork>) => {
    const res = await settlementFetch('/api/accounting/settlement/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleUpdate = async (data: Partial<RsWork>) => {
    if (!editWork) return;
    const res = await settlementFetch(`/api/accounting/settlement/works/${editWork.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditWork(null);
      await load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/works/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const handleLink = async () => {
    if (!linkWorkId || !linkPartnerId) return;
    setLinkSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/work-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_id: linkWorkId,
          partner_id: linkPartnerId,
          rs_rate: Number(linkRate),
          role: linkRole,
          is_mg_applied: linkMg,
        }),
      });
      if (res.ok) {
        setLinkDialogOpen(false);
        await load();
      } else {
        const data = await res.json();
        alert(data.error || '연결 실패');
      }
    } finally {
      setLinkSaving(false);
    }
  };

  const handleUnlink = async (id: string) => {
    if (!confirm('연결을 해제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/work-partners?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">RS 정산</h1>
        <MonthSelector />
      </div>

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>작품 관리</CardTitle>
          <div className="flex gap-2">
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setLinkDialogOpen(true)}>
                  <Link2 className="h-4 w-4 mr-1" />
                  파트너 연결
                </Button>
                <Button onClick={() => { setEditWork(null); setFormOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" />
                  작품 추가
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : works.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 작품이 없습니다.</div>
          ) : (
            <div className="space-y-4">
              {works.map((w) => {
                const wps = workPartners.filter(wp => wp.work_id === w.id);
                return (
                  <div key={w.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{w.name}</span>
                        {w.naver_name && w.naver_name !== w.name && (
                          <span className="text-xs text-muted-foreground">({w.naver_name})</span>
                        )}
                        <Badge variant="secondary">{CONTRACT_TYPE_LABELS[w.contract_type] || w.contract_type}</Badge>
                        {!w.is_active && <Badge variant="outline">비활성</Badge>}
                      </div>
                      {canManage && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditWork(w); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(w.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {wps.length > 0 && (
                      <div className="ml-4 space-y-1">
                        {wps.map((wp) => (
                          <div key={wp.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{wp.partner?.name || wp.partner_id}</span>
                            <span className="tabular-nums">RS {(Number(wp.rs_rate) * 100).toFixed(1)}%</span>
                            <Badge variant="outline" className="text-xs">{wp.role}</Badge>
                            {wp.is_mg_applied && <Badge variant="outline" className="text-xs">MG</Badge>}
                            {canManage && (
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleUnlink(wp.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <WorkForm
        work={editWork}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editWork ? handleUpdate : handleCreate}
      />

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>작품-파트너 연결</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>작품</Label>
              <Select value={linkWorkId} onValueChange={setLinkWorkId}>
                <SelectTrigger>
                  <SelectValue placeholder="작품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {works.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>파트너</Label>
              <Select value={linkPartnerId} onValueChange={setLinkPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="파트너 선택" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>RS 비율 (0~1)</Label>
              <Input type="number" step="0.01" min="0" max="1" value={linkRate} onChange={(e) => setLinkRate(e.target.value)} />
            </div>
            <div>
              <Label>역할</Label>
              <Input value={linkRole} onChange={(e) => setLinkRole(e.target.value)} placeholder="author" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={linkMg} onCheckedChange={(c) => setLinkMg(c === true)} id="mg-check" />
              <Label htmlFor="mg-check">MG 적용</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>취소</Button>
              <Button onClick={handleLink} disabled={linkSaving || !linkWorkId || !linkPartnerId}>
                {linkSaving ? '연결 중...' : '연결'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
