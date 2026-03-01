import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initProviders, getAllProviders } from '@/lib/video-generation/registry';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: 프로젝트별 테스트 목록 + 프로바이더 capabilities
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId 필요' }, { status: 400 });
  }

  try {
    await initProviders();

    const [testsResult, providers] = await Promise.all([
      supabase
        .from('webtoonanimation_video_tests')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50),
      Promise.resolve(getAllProviders()),
    ]);

    if (testsResult.error) throw testsResult.error;

    return NextResponse.json({
      tests: testsResult.data || [],
      providers,
    });
  } catch (error) {
    console.error('[video-tests] GET 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '조회 실패' },
      { status: 500 }
    );
  }
}

// DELETE: 테스트 삭제
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testId = searchParams.get('testId');

  if (!testId) {
    return NextResponse.json({ error: 'testId 필요' }, { status: 400 });
  }

  try {
    // Storage 파일 삭제
    const { data: test } = await supabase
      .from('webtoonanimation_video_tests')
      .select('video_path')
      .eq('id', testId)
      .single();

    if (test?.video_path) {
      await supabase.storage.from('webtoon-files').remove([test.video_path]);
    }

    const { error } = await supabase
      .from('webtoonanimation_video_tests')
      .delete()
      .eq('id', testId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[video-tests] DELETE 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제 실패' },
      { status: 500 }
    );
  }
}
