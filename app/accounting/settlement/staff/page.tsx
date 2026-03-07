'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { StaffForm } from '@/components/settlement/StaffForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { RsStaff, RsPartner, RsStaffAssignment } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

interface StaffWithSummary extends RsStaff {
  assignment_count: number;
  total_monthly_cost: number;
}

export default function StaffPage() {
  const router = useRouter();
  const { profile } = useStore();
  const [staffList, setStaffList] = useState<StaffWithSummary[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [staffRes, assignmentsRes, partnersRes] = await Promise.all([
        settlementFetch('/api/accounting/settlement/staff?activeOnly=false'),
        settlementFetch('/api/accounting/settlement/staff-assignments'),
        settlementFetch('/api/accounting/settlement/partners'),
      ]);
      const staffData = await staffRes.json();
      const assignmentsData = await assignmentsRes.json();
      const partnersData = await partnersRes.json();

      setPartners(partnersData.partners || []);

      const assignments: RsStaffAssignment[] = assignmentsData.assignments || [];
      const merged: StaffWithSummary[] = (staffData.staff || []).map((s: RsStaff) => {
        const staffAssignments = assignments.filter(a => a.staff_id === s.id);
        return {
          ...s,
          assignment_count: staffAssignments.length,
          total_monthly_cost: staffAssignments.reduce((sum, a) => sum + (Number(a.monthly_cost) || 0), 0),
        };
      });

      merged.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setStaffList(merged);
    } catch (e) {
      console.error('스태프 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile]);

  const handleCreate = async (data: Partial<RsStaff>) => {
    const res = await settlementFetch('/api/accounting/settlement/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  const filtered = search
    ? staffList.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.employer_partner as { name?: string } | null)?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : staffList;

  const totalMonthlyCost = filtered.reduce((s, st) => s + st.total_monthly_cost, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>인력 관리</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름, 소속작가 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-full md:w-52"
              />
            </div>
            {canManage && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                인력 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : staffList.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 인력이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium">이름</th>
                    <th className="py-2 px-3 font-medium">소속 구분</th>
                    <th className="py-2 px-3 font-medium hidden md:table-cell">소속 작가</th>
                    <th className="py-2 px-3 font-medium text-right">월 급여</th>
                    <th className="py-2 px-3 font-medium text-right">배정 작품</th>
                    <th className="py-2 px-3 font-medium text-right">월 비용 합계</th>
                    <th className="py-2 px-3 font-medium text-center hidden md:table-cell">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => router.push(`/accounting/settlement/staff/${s.id}`)}
                    >
                      <td className="py-2 px-3 font-medium">{s.name}</td>
                      <td className="py-2 px-3">
                        <Badge variant="secondary">
                          {s.employer_type === 'author' ? '작가 소속' : '회사 소속'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">
                        {(s.employer_partner as { name?: string } | null)?.name || '-'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">
                        {s.monthly_salary > 0 ? Number(s.monthly_salary).toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {s.assignment_count || '-'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">
                        {s.total_monthly_cost > 0 ? s.total_monthly_cost.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-3 text-center hidden md:table-cell">
                        {s.is_active ? (
                          <Badge variant="default">활성</Badge>
                        ) : (
                          <Badge variant="outline">비활성</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3">합계 ({filtered.length}명{search ? ` / ${staffList.length}명` : ''})</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums">{filtered.reduce((s, st) => s + (Number(st.monthly_salary) || 0), 0).toLocaleString()}</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right tabular-nums">{totalMonthlyCost > 0 ? totalMonthlyCost.toLocaleString() : '-'}</td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <StaffForm
        partners={partners}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleCreate}
      />
    </div>
  );
}
