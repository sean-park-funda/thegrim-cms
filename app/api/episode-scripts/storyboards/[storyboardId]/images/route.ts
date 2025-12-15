import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: /api/episode-scripts/storyboards/[storyboardId]/images
// 특정 스토리보드의 모든 컷 이미지를 조회
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ storyboardId: string }> }
) {
  const { storyboardId } = await context.params;
  if (!storyboardId) {
    return NextResponse.json({ error: 'storyboardId가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('episode_script_storyboard_images')
    .select('id, storyboard_id, cut_index, mime_type, image_base64')
    .eq('storyboard_id', storyboardId)
    .order('cut_index', { ascending: true });

  if (error) {
    console.error('[storyboard-images][GET] 조회 실패:', error);
    return NextResponse.json({ error: '이미지 조회에 실패했습니다.' }, { status: 500 });
  }

  // base64를 data URL로 변환하여 반환
  const images = (data ?? []).map((img) => ({
    id: img.id,
    storyboardId: img.storyboard_id,
    cutIndex: img.cut_index,
    mimeType: img.mime_type,
    imageUrl: `data:${img.mime_type};base64,${img.image_base64}`,
  }));

  return NextResponse.json(images);
}

