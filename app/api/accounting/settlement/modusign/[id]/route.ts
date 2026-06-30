import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  if ('categories' in body) {
    const cats = Array.isArray(body.categories) ? body.categories.filter(Boolean) : [];
    update.categories = cats.length > 0 ? cats : null;
  }
  if ('classification' in body) {
    update.classification = (body.classification as string) || null;
  }
  if ('labels' in body) {
    const lbls = Array.isArray(body.labels) ? body.labels.filter((l: { name: string }) => l?.name) : [];
    update.labels = lbls.length > 0 ? lbls : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await serviceClient
    .from('modusign_contracts')
    .update(update)
    .eq('document_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
