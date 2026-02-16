'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { PartnerForm } from '@/components/settlement/PartnerForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { RsPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  domestic_corp: '국내법인',
  foreign_corp: '해외법인',
  naver: '네이버',
};

export default function PartnersPage() {
  const router = useRouter();
  const { profile } = useStore();
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<RsPartner | null>(null);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/partners');
      const data = await res.json();
      setPartners(data.partners || []);
    } catch (e) {
      console.error('파트너 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile]);

  const handleCreate = async (data: Partial<RsPartner>) => {
    const res = await settlementFetch('/api/accounting/settlement/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleUpdate = async (data: Partial<RsPartner>) => {
    if (!editPartner) return;
    const res = await settlementFetch(`/api/accounting/settlement/partners/${editPartner.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditPartner(null);
      await load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/partners/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <SettlementHeader />

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>파트너 관리</CardTitle>
          {canManage && (
            <Button onClick={() => { setEditPartner(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              파트너 추가
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : partners.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 파트너가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium">이름</th>
                    <th className="py-2 px-3 font-medium">회사명</th>
                    <th className="py-2 px-3 font-medium">유형</th>
                    <th className="py-2 px-3 font-medium">세율</th>
                    <th className="py-2 px-3 font-medium">이메일</th>
                    {canManage && <th className="py-2 px-3 font-medium"></th>}
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium">{p.name}</td>
                      <td className="py-2 px-3">{p.company_name || '-'}</td>
                      <td className="py-2 px-3">
                        <Badge variant="secondary">{PARTNER_TYPE_LABELS[p.partner_type] || p.partner_type}</Badge>
                      </td>
                      <td className="py-2 px-3 tabular-nums">{(Number(p.tax_rate) * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3">{p.email || '-'}</td>
                      {canManage && (
                        <td className="py-2 px-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditPartner(p); setFormOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PartnerForm
        partner={editPartner}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editPartner ? handleUpdate : handleCreate}
      />
    </div>
  );
}
