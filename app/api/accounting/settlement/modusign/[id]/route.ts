import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ALLOWED_FIELDS = ['category', 'classification'] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

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
  const update: Partial<Record<AllowedField, string | null>> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) update[field] = (body[field] as string) || null;
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
