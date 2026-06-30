import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// POST /api/accounting/settlement/modusign/labels
// body: { from: string, to?: string }
// to 있으면 → 라벨 이름 변경, to 없으면 → 해당 라벨 전체 제거
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { supabase } = auth;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', auth.userId)
    .single();

  if (!profile || !canViewAccounting(profile.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json();
  const fromLabel: string = body.from?.trim();
  const toLabel: string | undefined = body.to?.trim();

  if (!fromLabel) {
    return NextResponse.json({ error: 'from 라벨이 필요합니다.' }, { status: 400 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 해당 라벨이 있는 계약 조회
  const { data: rows, error: fetchError } = await serviceClient
    .from('modusign_contracts')
    .select('document_id, labels')
    .contains('labels', [{ name: fromLabel }]);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ updated: 0 });

  // 각 계약의 labels 배열을 업데이트
  const updates = rows.map(row => {
    const labels = (row.labels as { name: string }[] || []).map(l => {
      if (l.name !== fromLabel) return l;
      if (!toLabel) return null; // 제거
      return { ...l, name: toLabel }; // 이름 변경
    }).filter(Boolean);

    return serviceClient
      .from('modusign_contracts')
      .update({ labels })
      .eq('document_id', row.document_id);
  });

  await Promise.all(updates);

  return NextResponse.json({ updated: rows.length });
}
