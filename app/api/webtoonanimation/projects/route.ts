import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('webtoonanimation_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('[webtoonanimation/projects] GET 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프로젝트 목록 조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = body.title || '새 프로젝트';

    const { data, error } = await supabase
      .from('webtoonanimation_projects')
      .insert({ title })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[webtoonanimation/projects] POST 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프로젝트 생성 실패' },
      { status: 500 }
    );
  }
}
