'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { StaffForm } from '@/components/settlement/StaffForm';
import { StaffAssignmentDialog } from '@/components/settlement/StaffAssignmentDialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { RsStaff, RsStaffAssignment, RsStaffSalary, RsPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : '-');

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = params.id as string;
  const { profile } = useStore();

  const [staff, setStaff] = useState<RsStaff | null>(null);
  const [assignments, setAssignments] = useState<RsStaffAssignment[]>([]);
  const [salaries, setSalaries] = useState<RsStaffSalary[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<RsStaffAssignment | null>(null);

  // 급여 인라인 편집
  const [editingSalaryMonth, setEditingSalaryMonth] = useState<string | null>(null);
  const [editingSalaryAmount, setEditingSalaryAmount] = useState('');
  const [addSalaryMonth, setAddSalaryMonth] = useState('');
  const [addSalaryAmount, setAddSalaryAmount] = useState('');
  const [salaryAdding, setSalaryAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [detailRes, partnersRes, salariesRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/staff/${staffId}`),
        settlementFetch('/api/accounting/settlement/partners'),
        settlementFetch(`/api/accounting/settlement/staff-salaries?staffId=${staffId}`),
      ]);
      const detailData = await detailRes.json();
      const partnersData = await partnersRes.json();
      const salariesData = await salariesRes.json();
      setStaff(detailData.staff || null);
      setAssignments(detailData.assignments || []);
      setPartners(partnersData.partners || []);
      setSalaries(salariesData.salaries || []);
    } catch (e) {
      console.error('스태프 상세 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role) && staffId) {
      load();
    }
  }, [profile, staffId]);

  const handleUpdate = async (data: Partial<RsStaff>) => {
    const res = await settlementFetch(`/api/accounting/settlement/staff/${staffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleDeleteStaff = async () => {
    if (!confirm('이 인력을 삭제하시겠습니까? 모든 배정 정보도 함께 삭제됩니다.')) return;
    const res = await settlementFetch(`/api/accounting/settlement/staff/${staffId}`, { method: 'DELETE' });
    if (res.ok) router.push('/accounting/settlement/staff');
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('이 배정을 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/staff-assignments?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const handleSaveSalary = async (month: string, amount: string) => {
    const res = await settlementFetch('/api/accounting/settlement/staff-salaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId, month, amount: Number(amount) || 0 }),
    });
    if (res.ok) {
      setEditingSalaryMonth(null);
      await load();
    }
  };

  const handleDeleteSalary = async (id: string) => {
    if (!confirm('이 급여 기록을 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/staff-salaries?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const handleAddSalary = async () => {
    if (!addSalaryMonth || !addSalaryAmount) return;
    setSalaryAdding(true);
    try {
      await handleSaveSalary(addSalaryMonth, addSalaryAmount);
      setAddSalaryMonth('');
      setAddSalaryAmount('');
    } finally {
      setSalaryAdding(false);
    }
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);
  const existingWorkIds = assignments.map(a => a.work_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/accounting/settlement/staff">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            인력 목록
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
      ) : !staff ? (
        <div className="text-sm text-muted-foreground py-8 text-center">인력을 찾을 수 없습니다.</div>
      ) : (
        <>
          {/* 인력 기본 정보 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>{staff.name}</CardTitle>
                <Badge variant="secondary">
                  {staff.employer_type === 'author' ? '작가 소속' : '회사 소속'}
                </Badge>
                {!staff.is_active && <Badge variant="outline">비활성</Badge>}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    수정
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeleteStaff}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    삭제
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {staff.employer_type === 'author' && (
                  <div>
                    <div className="text-muted-foreground">소속 작가</div>
                    <div className="font-medium">
                      {(staff.employer_partner as { name?: string } | null)?.name || '-'}
                    </div>
                  </div>
                )}
                {staff.phone && (
                  <div>
                    <div className="text-muted-foreground">연락처</div>
                    <div className="font-medium">{staff.phone}</div>
                  </div>
                )}
                {staff.email && (
                  <div>
                    <div className="text-muted-foreground">이메일</div>
                    <div className="font-medium">{staff.email}</div>
                  </div>
                )}
                {staff.bank_name && (
                  <div>
                    <div className="text-muted-foreground">계좌</div>
                    <div className="font-medium">{staff.bank_name} {staff.bank_account}</div>
                  </div>
                )}
              </div>
              {staff.note && (
                <p className="text-sm text-muted-foreground mt-3">{staff.note}</p>
              )}
            </CardContent>
          </Card>

          {/* 작품 배정 목록 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">작품 배정 ({assignments.length}건)</CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => { setEditAssignment(null); setAssignDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" />
                  배정 추가
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">배정된 작품이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">작품</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">메모</th>
                        {canManage && <th className="py-2 px-3 font-medium w-8"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3">
                            <Link
                              href={`/accounting/settlement/works/${a.work_id}`}
                              className="text-primary hover:underline"
                            >
                              {(a.work as { name?: string } | null)?.name || a.work_id}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{a.note || '-'}</td>
                          {canManage && (
                            <td className="py-2 px-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDeleteAssignment(a.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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

          {/* 월별 급여 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">월별 급여</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3 font-medium">월</th>
                      <th className="py-2 px-3 font-medium text-right">금액</th>
                      {canManage && <th className="py-2 px-3 font-medium w-20"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {salaries.map((s) => (
                      <tr key={s.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{s.month}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {editingSalaryMonth === s.month ? (
                            <div className="inline-flex items-center gap-1">
                              <Input
                                type="number"
                                value={editingSalaryAmount}
                                onChange={(e) => setEditingSalaryAmount(e.target.value)}
                                className="w-32 h-7 text-right"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveSalary(s.month, editingSalaryAmount);
                                  if (e.key === 'Escape') setEditingSalaryMonth(null);
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleSaveSalary(s.month, editingSalaryAmount)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setEditingSalaryMonth(null)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span
                              className={canManage ? 'cursor-pointer hover:text-primary' : ''}
                              onClick={() => {
                                if (canManage) {
                                  setEditingSalaryMonth(s.month);
                                  setEditingSalaryAmount(String(s.amount));
                                }
                              }}
                            >
                              {Number(s.amount).toLocaleString()}원
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="py-2 px-3">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingSalaryMonth(s.month);
                                  setEditingSalaryAmount(String(s.amount));
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDeleteSalary(s.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {canManage && (
                      <tr className="border-t-2">
                        <td className="py-2 px-3">
                          <Input
                            type="month"
                            value={addSalaryMonth}
                            onChange={(e) => setAddSalaryMonth(e.target.value)}
                            className="w-40 h-8"
                            placeholder="월 선택"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Input
                            type="number"
                            value={addSalaryAmount}
                            onChange={(e) => setAddSalaryAmount(e.target.value)}
                            className="w-32 h-8 text-right ml-auto"
                            placeholder="금액"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSalary(); }}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={handleAddSalary}
                            disabled={salaryAdding || !addSalaryMonth || !addSalaryAmount}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            추가
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {salaries.length === 0 && !canManage && (
                <div className="text-sm text-muted-foreground py-4 text-center">급여 데이터가 없습니다.</div>
              )}
            </CardContent>
          </Card>

          <StaffForm
            staff={staff}
            partners={partners}
            open={formOpen}
            onOpenChange={setFormOpen}
            onSave={handleUpdate}
          />

          <StaffAssignmentDialog
            staffId={staffId}
            employerPartnerId={staff?.employer_partner_id || undefined}
            assignment={editAssignment}
            existingWorkIds={existingWorkIds}
            open={assignDialogOpen}
            onOpenChange={setAssignDialogOpen}
            onSaved={load}
          />
        </>
      )}
    </div>
  );
}
