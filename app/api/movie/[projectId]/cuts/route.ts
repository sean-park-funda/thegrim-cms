import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// GET: 컷 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  console.log('[cuts] 목록 조회:', { projectId });

  const { data: cuts, error } = await supabase
    .from('movie_cuts')
    .select(`
      *,
      background:movie_backgrounds(id, name, image_path)
    `)
    .eq('project_id', projectId)
    .order('cut_index');

  if (error) {
    console.error('[cuts] 조회 실패:', error);
    return NextResponse.json(
      { error: '컷 목록을 불러올 수 없습니다.' },
      { status: 500 }
    );
  }

  return NextResponse.json(cuts || []);
}
