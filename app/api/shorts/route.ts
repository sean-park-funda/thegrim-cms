import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// shorts_projects 타입 정의
interface ShortsProject {
  id: string;
  title: string | null;
  script: string;
  status: string;
  video_mode: 'cut-to-cut' | 'per-cut';
  grid_size: '2x2' | '3x3';
  grid_image_path: string | null;
  video_script: unknown;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// GET: /api/shorts - 모든 프로젝트 목록 조회
export async function GET(request: NextRequest) {
  console.log('[shorts][GET] 프로젝트 목록 조회');

  // 쿼리 파라미터에서 currentUserId와 visibility 추출
  const { searchParams } = new URL(request.url);
  const currentUserId = searchParams.get('currentUserId');
  const visibility = searchParams.get('visibility') || 'public'; // 'public' | 'private'

  let query = supabaseAdmin
    .from('shorts_projects')
    .select(`
      id,
      title,
      script,
      status,
      video_mode,
      grid_size,
      grid_image_path,
      video_script,
      is_public,
      created_by,
      created_at,
      updated_at,
      shorts_characters (
        id,
        name,
        image_path
      ),
      shorts_scenes (
        id,
        scene_index,
        status,
        video_path
      )
    `)
    .order('created_at', { ascending: false });

  // 공개/비공개 필터링
  if (visibility === 'private') {
    // 비공개: 내가 만든 비공개 프로젝트만
    if (!currentUserId) {
      return NextResponse.json([]); // 로그인 안 했으면 빈 배열
    }
    query = query.eq('is_public', false).eq('created_by', currentUserId);
  } else {
    // 공개: 공개 프로젝트만
    query = query.eq('is_public', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[shorts][GET] 조회 실패:', error);
    return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: /api/shorts - 새 프로젝트 생성
export async function POST(request: NextRequest) {
  console.log('[shorts][POST] 새 프로젝트 생성');

  const body = await request.json().catch(() => null) as {
    title?: string;
    script?: string;
    video_mode?: 'cut-to-cut' | 'per-cut';
    grid_size?: '2x2' | '3x3';
    is_public?: boolean;
    created_by?: string;
  } | null;

  const script = body?.script?.trim();
  const title = body?.title?.trim() || null;
  const video_mode = body?.video_mode || 'per-cut';
  const grid_size = body?.grid_size || '2x2';
  const is_public = body?.is_public ?? true; // 기본값은 공개
  const created_by = body?.created_by || null;

  if (!script) {
    return NextResponse.json({ error: '대본(script)이 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('shorts_projects')
    .insert({
      title,
      script,
      video_mode,
      grid_size,
      status: 'draft',
      is_public,
      created_by,
    })
    .select()
    .single();

  if (error) {
    console.error('[shorts][POST] 생성 실패:', error);
    return NextResponse.json({ error: '프로젝트 생성에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
