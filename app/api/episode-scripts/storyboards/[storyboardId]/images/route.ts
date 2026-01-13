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

  // image_type 컬럼이 없을 수 있으므로 먼저 기본 컬럼만 조회 시도
  let data: Array<{
    id: string;
    storyboard_id: string;
    cut_index: number;
    mime_type: string;
    image_base64: string;
    image_type?: string;
  }> | null = null;
  let error: Error | null = null;

  // image_type 컬럼 포함하여 조회 시도
  const resultWithType = await supabase
    .from('episode_script_storyboard_images')
    .select('id, storyboard_id, cut_index, mime_type, image_base64, image_type')
    .eq('storyboard_id', storyboardId)
    .order('cut_index', { ascending: true });

  if (resultWithType.error) {
    // image_type 컬럼이 없을 수 있음 - 기본 컬럼만으로 재시도
    console.warn('[storyboard-images][GET] image_type 컬럼 조회 실패, 기본 컬럼만 조회:', resultWithType.error.message);
    const resultWithoutType = await supabase
      .from('episode_script_storyboard_images')
      .select('id, storyboard_id, cut_index, mime_type, image_base64')
      .eq('storyboard_id', storyboardId)
      .order('cut_index', { ascending: true });

    if (resultWithoutType.error) {
      console.error('[storyboard-images][GET] 조회 실패:', resultWithoutType.error);
      error = new Error(resultWithoutType.error.message);
    } else {
      data = resultWithoutType.data?.map(img => ({ ...img, image_type: 'cut' })) ?? null;
    }
  } else {
    data = resultWithType.data ?? null;
  }

  if (error) {
    return NextResponse.json({ error: '이미지 조회에 실패했습니다.' }, { status: 500 });
  }

  // base64를 data URL로 변환하여 반환
  const images = (data ?? []).map((img) => ({
    id: img.id,
    storyboardId: img.storyboard_id,
    cutIndex: img.cut_index,
    mimeType: img.mime_type,
    imageType: (img.image_type as string) || 'cut', // 기본값: 'cut'
    imageUrl: `data:${img.mime_type};base64,${img.image_base64}`,
  }));

  return NextResponse.json(images);
}

