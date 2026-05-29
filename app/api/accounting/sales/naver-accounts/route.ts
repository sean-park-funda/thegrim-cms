import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { canViewSales, canManageTitleMaster, UserRole } from '@/lib/utils/permissions';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function checkRole(request: NextRequest, requiredCheck: (role: UserRole) => boolean) {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return { error: '인증이 필요합니다.', status: 401 };

  const { data: profile } = await auth.supabase
    .from('user_profiles')
    .select('role')
    .eq('id', auth.userId)
    .single();

  if (!profile || !requiredCheck(profile.role as UserRole)) {
    return { error: '권한이 없습니다.', status: 403 };
  }

  return { ok: true };
}

// GET — 작품명으로 네이버 계정 조회
export async function GET(request: NextRequest) {
  const roleCheck = await checkRole(request, canViewSales);
  if ('error' in roleCheck) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const workName = searchParams.get('work_name');

  const admin = getAdminClient();
  let query = admin
    .from('rs_naver_accounts')
    .select('id, work_name, login_id, login_pw, note, is_active, created_at, updated_at')
    .neq('work_name', '브랜드');

  if (workName) {
    query = query.eq('work_name', workName);
  }
  query = query.order('work_name');

  const { data, error } = await query;
  if (error) {
    console.error('네이버 계정 조회 오류:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  const masked = (data || []).map(acc => ({
    ...acc,
    login_pw: acc.login_pw ? acc.login_pw.substring(0, 2) + '••••' : null,
  }));

  return NextResponse.json({ accounts: masked });
}

// POST — 네이버 계정 생성
export async function POST(request: NextRequest) {
  const roleCheck = await checkRole(request, canManageTitleMaster);
  if ('error' in roleCheck) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  const body = await request.json();
  const { work_name, login_id, login_pw, note } = body;

  if (!work_name || !login_id || !login_pw) {
    return NextResponse.json({ error: '작품명, 로그인 ID, 비밀번호는 필수입니다.' }, { status: 400 });
  }

  if (work_name === '브랜드') {
    return NextResponse.json({ error: '브랜드 계정은 이 화면에서 관리할 수 없습니다.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('rs_naver_accounts')
    .insert({ work_name, login_id, login_pw, note: note || null, is_active: true })
    .select('id, work_name, login_id, note, is_active, created_at, updated_at')
    .single();

  if (error) {
    console.error('네이버 계정 생성 오류:', error);
    return NextResponse.json({ error: '생성 실패' }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

// PUT — 네이버 계정 수정
export async function PUT(request: NextRequest) {
  const roleCheck = await checkRole(request, canManageTitleMaster);
  if ('error' in roleCheck) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  const body = await request.json();
  const { id, login_id, login_pw, note, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: existing } = await admin
    .from('rs_naver_accounts')
    .select('work_name')
    .eq('id', id)
    .single();

  if (existing?.work_name === '브랜드') {
    return NextResponse.json({ error: '브랜드 계정은 이 화면에서 관리할 수 없습니다.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (login_id !== undefined) updates.login_id = login_id;
  if (login_pw) updates.login_pw = login_pw;
  if (note !== undefined) updates.note = note || null;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await admin
    .from('rs_naver_accounts')
    .update(updates)
    .eq('id', id)
    .select('id, work_name, login_id, login_pw, note, is_active, created_at, updated_at')
    .single();

  if (error) {
    console.error('네이버 계정 수정 오류:', error);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }

  return NextResponse.json({
    account: {
      ...data,
      login_pw: data.login_pw ? data.login_pw.substring(0, 2) + '••••' : null,
    },
  });
}

// DELETE — 네이버 계정 비활성화
export async function DELETE(request: NextRequest) {
  const roleCheck = await checkRole(request, canManageTitleMaster);
  if ('error' in roleCheck) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: existing } = await admin
    .from('rs_naver_accounts')
    .select('work_name')
    .eq('id', Number(id))
    .single();

  if (existing?.work_name === '브랜드') {
    return NextResponse.json({ error: '브랜드 계정은 이 화면에서 관리할 수 없습니다.' }, { status: 400 });
  }

  const { error } = await admin
    .from('rs_naver_accounts')
    .delete()
    .eq('id', Number(id));

  if (error) {
    console.error('네이버 계정 삭제 오류:', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
