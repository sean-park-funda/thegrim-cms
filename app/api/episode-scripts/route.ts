import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: /api/episode-scripts?episodeId=...
// POST: /api/episode-scripts { episodeId, title?, content }
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('episodeId');

  if (!episodeId) {
    return NextResponse.json({ error: 'episodeId가 필요합니다.' }, { status: 400 });
  }

  // 인증은 RLS(Row Level Security) 정책에 의해 처리됨
  console.log('[episode-scripts][GET] 요청 시작:', { episodeId, timestamp: new Date().toISOString() });
  const queryStartTime = Date.now();

  // 가벼운 대본 목록만 조회 (storyboards, images 제거, 캐릭터 시트 최신화 제거)
  const { data, error } = await supabase
    .from('episode_scripts')
    .select('id, episode_id, title, content, order_index, character_analysis, created_at, created_by')
    .eq('episode_id', episodeId)
    .order('order_index', { ascending: true });

  const queryTime = Date.now() - queryStartTime;
  console.log('[episode-scripts][GET] 쿼리 완료:', {
    episodeId,
    queryTime: `${queryTime}ms`,
    scriptsCount: data?.length || 0,
  });

  if (error) {
    console.error('[episode-scripts][GET] 조회 실패:', error);
    return NextResponse.json({ error: '스크립트 조회에 실패했습니다.' }, { status: 500 });
  }

  // character_analysis는 DB에 저장된 그대로 반환 (캐릭터 시트 최신화는 선택된 대본에서만 수행)

  const totalTime = Date.now() - startTime;
  console.log('[episode-scripts][GET] 전체 요청 완료:', {
    episodeId,
    totalTime: `${totalTime}ms`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  // 인증은 RLS(Row Level Security) 정책에 의해 처리됨
  
  const body = await request.json().catch(() => null) as {
    episodeId?: string;
    title?: string;
    content?: string;
    createdBy?: string;
  } | null;

  const episodeId = body?.episodeId?.trim();
  const content = body?.content?.trim();
  const title = (body?.title ?? '').trim();
  const createdBy = body?.createdBy;

  if (!episodeId || !content) {
    return NextResponse.json({ error: 'episodeId와 content가 필요합니다.' }, { status: 400 });
  }

  // order_index 계산: 해당 에피소드에서 마지막 값 + 1
  const { data: lastOrder } = await supabase
    .from('episode_scripts')
    .select('order_index')
    .eq('episode_id', episodeId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastOrder?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from('episode_scripts')
    .insert({
      episode_id: episodeId,
      title,
      content,
      order_index: nextOrder,
      created_by: createdBy ?? null,
    })
    .select('id, episode_id, title, content, order_index, character_analysis, created_at, created_by')
    .single();

  if (error) {
    console.error('[episode-scripts][POST] 생성 실패:', error);
    return NextResponse.json({ error: '스크립트 생성에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

