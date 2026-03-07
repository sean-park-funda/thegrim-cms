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
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react';
import { RsStaff, RsStaffAssignment, RsPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : '-');

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = params.id as string;
  const { profile } = useStore();

  const [staff, setStaff] = useState<RsStaff | null>(null);
  const [assignments, setAssignments] = useState<RsStaffAssignment[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<RsStaffAssignment | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [detailRes, partnersRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/staff/${staffId}`),
        settlementFetch('/api/accounting/settlement/partners'),
      ]);
      const detailData = await detailRes.json();
      const partnersData = await partnersRes.json();
      setStaff(detailData.staff || null);
      setAssignments(detailData.assignments || []);
      setPartners(partnersData.partners || []);
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

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);
  const existingWorkIds = assignments.map(a => a.work_id);
  const totalMonthlyCost = assignments.reduce((sum, a) => sum + (Number(a.monthly_cost) || 0), 0);

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
                <div>
                  <div className="text-muted-foreground">월 급여</div>
                  <div className="font-medium">{Number(staff.monthly_salary) > 0 ? Number(staff.monthly_salary).toLocaleString() + '원' : '-'}</div>
                </div>
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
                        <th className="py-2 px-3 font-medium text-right">월 비용</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">시작월</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">종료월</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">메모</th>
                        {canManage && <th className="py-2 px-3 font-medium"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr
                          key={a.id}
                          className={`border-b hover:bg-muted/50 ${canManage ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (canManage) {
                              setEditAssignment(a);
                              setAssignDialogOpen(true);
                            }
                          }}
                        >
                          <td className="py-2 px-3">
                            <Link
                              href={`/accounting/settlement/works/${a.work_id}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(a.work as { name?: string } | null)?.name || a.work_id}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">
                            {fmt(Number(a.monthly_cost))}
                          </td>
                          <td className="py-2 px-3 hidden md:table-cell">{a.start_month || '-'}</td>
                          <td className="py-2 px-3 hidden md:table-cell">{a.end_month || '진행중'}</td>
                          <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{a.note || '-'}</td>
                          {canManage && (
                            <td className="py-2 px-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAssignment(a.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="py-2 px-3">합계</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(totalMonthlyCost)}</td>
                        <td className="py-2 px-3 hidden md:table-cell" colSpan={canManage ? 4 : 3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
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
