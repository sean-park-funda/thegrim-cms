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
import { Check, Pencil, Plus, Search, X } from 'lucide-react';
import { RsStaff, RsPartner, RsStaffAssignment, RsStaffSalary } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { useSettlementStore } from '@/lib/store/useSettlementStore';

interface StaffWithSummary extends RsStaff {
  assignment_count: number;
  total_monthly_cost: number;
}

interface PartnerSalaryRow {
  id: string; // partner_id prefixed
  partner_id: string;
  name: string;
  is_partner: true;
  monthly_salary: number;
}

type ListRow = (StaffWithSummary & { is_partner?: false }) | PartnerSalaryRow;

export default function StaffPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [staffList, setStaffList] = useState<StaffWithSummary[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [salaryPartners, setSalaryPartners] = useState<PartnerSalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [salaryEditMode, setSalaryEditMode] = useState(false);
  const [salaryEdits, setSalaryEdits] = useState<Record<string, string>>({});
  const [salarySaving, setSalarySaving] = useState(false);
  const [monthSalaries, setMonthSalaries] = useState<Record<string, number>>({});
  const [partnerMonthSalaries, setPartnerMonthSalaries] = useState<Record<string, number>>({});

  const loadMonthSalaries = async (month: string) => {
    try {
      const [staffSalRes, partnerSalRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/staff-salaries?month=${month}`),
        settlementFetch(`/api/accounting/settlement/partner-salaries?month=${month}`),
      ]);
      const staffSalData = await staffSalRes.json();
      const partnerSalData = await partnerSalRes.json();

      const staffMap: Record<string, number> = {};
      for (const sal of (staffSalData.salaries || []) as RsStaffSalary[]) {
        staffMap[sal.staff_id] = Number(sal.amount);
      }
      setMonthSalaries(staffMap);

      const partnerMap: Record<string, number> = {};
      for (const sal of (partnerSalData.salaries || [])) {
        partnerMap[sal.partner_id] = Number(sal.amount);
      }
      setPartnerMonthSalaries(partnerMap);
    } catch (e) {
      console.error('월별 급여 로드 오류:', e);
    }
  };

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

      const allPartners: RsPartner[] = partnersData.partners || [];
      setPartners(allPartners);

      // has_salary 파트너를 인력 목록에 포함
      const salPartners: PartnerSalaryRow[] = allPartners
        .filter((p: RsPartner) => p.has_salary)
        .map((p: RsPartner) => ({
          id: `partner_${p.id}`,
          partner_id: p.id,
          name: p.name,
          is_partner: true as const,
          monthly_salary: 0,
        }));
      setSalaryPartners(salPartners);

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

  useEffect(() => {
    if (profile && canViewAccounting(profile.role) && selectedMonth) {
      loadMonthSalaries(selectedMonth);
    }
  }, [profile, selectedMonth]);

  const handleEnterSalaryEdit = () => {
    const edits: Record<string, string> = {};
    for (const s of staffList) {
      if (!s.is_active) continue;
      edits[s.id] = monthSalaries[s.id] !== undefined
        ? String(monthSalaries[s.id])
        : String(s.monthly_salary || 0);
    }
    for (const p of salaryPartners) {
      edits[p.id] = partnerMonthSalaries[p.partner_id] !== undefined
        ? String(partnerMonthSalaries[p.partner_id])
        : '0';
    }
    setSalaryEdits(edits);
    setSalaryEditMode(true);
  };

  const handleCancelSalaryEdit = () => {
    setSalaryEditMode(false);
    setSalaryEdits({});
  };

  const handleSaveSalaries = async () => {
    setSalarySaving(true);
    try {
      const promises = Object.entries(salaryEdits).map(([id, amount]) => {
        if (id.startsWith('partner_')) {
          const partnerId = id.replace('partner_', '');
          return settlementFetch('/api/accounting/settlement/partner-salaries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partner_id: partnerId, month: selectedMonth, amount: Number(amount) || 0 }),
          });
        }
        return settlementFetch('/api/accounting/settlement/staff-salaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_id: id, month: selectedMonth, amount: Number(amount) || 0 }),
        });
      });
      await Promise.all(promises);
      await loadMonthSalaries(selectedMonth);
      setSalaryEditMode(false);
      setSalaryEdits({});
    } catch (e) {
      console.error('급여 일괄 저장 오류:', e);
    } finally {
      setSalarySaving(false);
    }
  };

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

  const allRows: ListRow[] = [
    ...salaryPartners,
    ...staffList.map(s => ({ ...s, is_partner: false as const })),
  ];

  const filtered = search
    ? allRows.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (!r.is_partner && (r.employer_partner as { name?: string } | null)?.name?.toLowerCase().includes(search.toLowerCase()))
      )
    : allRows;

  const totalMonthlyCost = filtered.reduce((s, r) => s + (r.is_partner ? 0 : r.total_monthly_cost), 0);

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
            {canManage && !salaryEditMode && (
              <Button variant="outline" onClick={handleEnterSalaryEdit}>
                <Pencil className="h-4 w-4 mr-1" />
                {selectedMonth} 급여 수정
              </Button>
            )}
            {canManage && salaryEditMode && (
              <>
                <Button onClick={handleSaveSalaries} disabled={salarySaving}>
                  <Check className="h-4 w-4 mr-1" />
                  {salarySaving ? '저장 중...' : '저장'}
                </Button>
                <Button variant="outline" onClick={handleCancelSalaryEdit} disabled={salarySaving}>
                  <X className="h-4 w-4 mr-1" />
                  취소
                </Button>
              </>
            )}
            {canManage && !salaryEditMode && (
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
          ) : allRows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 인력이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium">이름</th>
                    <th className="py-2 px-3 font-medium">소속 구분</th>
                    <th className="py-2 px-3 font-medium hidden md:table-cell">소속 작가</th>
                    <th className="py-2 px-3 font-medium text-right">{selectedMonth} 급여</th>
                    <th className="py-2 px-3 font-medium text-right">배정 작품</th>
                    <th className="py-2 px-3 font-medium text-right">월 비용 합계</th>
                    <th className="py-2 px-3 font-medium text-center hidden md:table-cell">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    if (row.is_partner) {
                      const amt = partnerMonthSalaries[row.partner_id] ?? 0;
                      return (
                        <tr
                          key={row.id}
                          className="border-b hover:bg-muted/50 cursor-pointer bg-blue-50/30 dark:bg-blue-950/10"
                          onClick={() => router.push(`/accounting/settlement/partners/${row.partner_id}`)}
                        >
                          <td className="py-2 px-3 font-medium">{row.name}</td>
                          <td className="py-2 px-3">
                            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30">본인</Badge>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">-</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">
                            {salaryEditMode && salaryEdits[row.id] !== undefined ? (
                              <Input
                                type="number"
                                value={salaryEdits[row.id]}
                                onChange={(e) => setSalaryEdits(prev => ({ ...prev, [row.id]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="h-8 w-32 text-right ml-auto tabular-nums"
                              />
                            ) : (
                              amt > 0 ? amt.toLocaleString() : '-'
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">-</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">-</td>
                          <td className="py-2 px-3 text-center hidden md:table-cell">
                            <Badge variant="default">활성</Badge>
                          </td>
                        </tr>
                      );
                    }
                    const s = row;
                    return (
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
                          {salaryEditMode && s.is_active && salaryEdits[s.id] !== undefined ? (
                            <Input
                              type="number"
                              value={salaryEdits[s.id]}
                              onChange={(e) => setSalaryEdits(prev => ({ ...prev, [s.id]: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-32 text-right ml-auto tabular-nums"
                            />
                          ) : (
                            (() => {
                              const amt = monthSalaries[s.id] ?? Number(s.monthly_salary);
                              return amt > 0 ? amt.toLocaleString() : '-';
                            })()
                          )}
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
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3">합계 ({filtered.length}명{search ? ` / ${allRows.length}명` : ''})</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {salaryEditMode
                        ? filtered.reduce((sum, r) => sum + (Number(salaryEdits[r.id]) || 0), 0).toLocaleString()
                        : filtered.reduce((sum, r) => {
                            if (r.is_partner) return sum + (partnerMonthSalaries[r.partner_id] || 0);
                            return sum + ((monthSalaries[r.id] ?? Number(r.monthly_salary)) || 0);
                          }, 0).toLocaleString()
                      }
                    </td>
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
