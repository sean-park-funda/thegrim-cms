import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'contract-pdfs';

export async function GET(
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

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // DB에서 storage 경로 조회
  const { data: contract, error } = await serviceClient
    .from('modusign_contracts')
    .select('pdf_storage_path')
    .eq('document_id', id)
    .single();

  if (error || !contract) {
    return NextResponse.json({ error: '계약 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (!contract.pdf_storage_path) {
    return NextResponse.json({ error: 'PDF가 아직 저장되지 않았습니다.' }, { status: 404 });
  }

  // Supabase Storage 서명 URL 생성 (10분 유효)
  const { data: signed, error: signError } = await serviceClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(contract.pdf_storage_path, 600);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'PDF URL 생성 실패.' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
