'use client';

import { useState } from 'react';
import { settlementFetch } from '@/lib/settlement/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, BookOpen, Film, Tv, Clapperboard, Award, MoreHorizontal } from 'lucide-react';

interface SecondaryBiz {
  id: string;
  work_id?: string;
  biz_type: string;
  title: string | null;
  status: string;
  partner: string | null;
  contract_date: string | null;
  note: string | null;
}

const BIZ_TYPES = [
  { value: 'publish', label: '출판', icon: BookOpen },
  { value: 'drama', label: '드라마', icon: Tv },
  { value: 'movie', label: '영화', icon: Film },
  { value: 'animation', label: '애니메이션', icon: Clapperboard },
  { value: 'license', label: '라이선스', icon: Award },
  { value: 'other', label: '기타', icon: MoreHorizontal },
];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  planned: { label: '기획중', variant: 'outline' },
  in_progress: { label: '진행중', variant: 'default' },
  completed: { label: '완료', variant: 'secondary' },
  cancelled: { label: '취소', variant: 'destructive' },
};

interface Props {
  workId: string;
  items: SecondaryBiz[];
  canManage: boolean;
  onReload: () => void;
}

export function SecondaryBizTab({ workId, items, canManage, onReload }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SecondaryBiz | null>(null);
  const [saving, setSaving] = useState(false);

  const [bizType, setBizType] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('planned');
  const [partner, setPartner] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [note, setNote] = useState('');

  const openCreate = () => {
    setEditing(null);
    setBizType('');
    setTitle('');
    setStatus('planned');
    setPartner('');
    setContractDate('');
    setNote('');
    setDialogOpen(true);
  };

  const openEdit = (item: SecondaryBiz) => {
    setEditing(item);
    setBizType(item.biz_type);
    setTitle(item.title || '');
    setStatus(item.status);
    setPartner(item.partner || '');
    setContractDate(item.contract_date || '');
    setNote(item.note || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!bizType) return;
    setSaving(true);
    try {
      const payload = {
        biz_type: bizType,
        title: title || null,
        status,
        partner: partner || null,
        contract_date: contractDate || null,
        note: note || null,
      };

      if (editing) {
        await settlementFetch(`/api/works/${workId}/secondary-biz`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
      } else {
        await settlementFetch(`/api/works/${workId}/secondary-biz`, {
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
    if (!confirm('2차 사업 정보를 삭제하시겠습니까?')) return;
    await settlementFetch(`/api/works/${workId}/secondary-biz`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    onReload();
  };

  const getBizType = (value: string) => BIZ_TYPES.find((t) => t.value === value);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">출판, 드라마, 영화, 애니메이션, 라이선스 등</p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            추가
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">등록된 2차 사업 정보가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3 font-medium">유형</th>
                <th className="py-2 px-3 font-medium">제목</th>
                <th className="py-2 px-3 font-medium hidden md:table-cell">파트너사</th>
                <th className="py-2 px-3 font-medium hidden md:table-cell">계약일</th>
                <th className="py-2 px-3 font-medium">상태</th>
                {canManage && <th className="py-2 px-3 font-medium w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const bt = getBizType(item.biz_type);
                const st = STATUS_MAP[item.status] || STATUS_MAP.planned;
                const Icon = bt?.icon || MoreHorizontal;
                return (
                  <tr key={item.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3">
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {bt?.label || item.biz_type}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {item.title || '-'}
                      {item.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{item.note}</p>
                      )}
                    </td>
                    <td className="py-2 px-3 hidden md:table-cell">{item.partner || '-'}</td>
                    <td className="py-2 px-3 hidden md:table-cell">{item.contract_date || '-'}</td>
                    <td className="py-2 px-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    {canManage && (
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '2차 사업 수정' : '2차 사업 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>사업 유형</Label>
              <Select value={bizType} onValueChange={setBizType}>
                <SelectTrigger><SelectValue placeholder="유형 선택" /></SelectTrigger>
                <SelectContent>
                  {BIZ_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 드라마 시즌1" />
            </div>
            <div className="space-y-2">
              <Label>진행 상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">기획중</SelectItem>
                  <SelectItem value="in_progress">진행중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="cancelled">취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>파트너사</Label>
                <Input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="제작사/출판사" />
              </div>
              <div className="space-y-2">
                <Label>계약일</Label>
                <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleSave} disabled={!bizType || saving}>
                {saving ? '저장 중...' : editing ? '수정' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
