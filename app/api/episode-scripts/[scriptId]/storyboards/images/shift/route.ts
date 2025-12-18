import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scriptId: string }> }
) {
  try {
    const { scriptId } = await context.params;
    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null) as {
      storyboardId: string;
      fromCutIndex: number; // 이 인덱스부터 밀기 시작
    } | null;

    if (!body || !body.storyboardId || body.fromCutIndex === undefined) {
      return NextResponse.json(
        { error: 'storyboardId, fromCutIndex가 필요합니다.' },
        { status: 400 }
      );
    }

    const { storyboardId, fromCutIndex } = body;

    // 해당 스토리보드의 이미지들 조회
    const { data: images, error: fetchError } = await supabase
      .from('episode_script_storyboard_images')
      .select('id, cut_index')
      .eq('storyboard_id', storyboardId)
      .gte('cut_index', fromCutIndex)
      .order('cut_index', { ascending: false }); // 역순으로 업데이트하여 중복 방지

    if (fetchError) {
      console.error('[이미지 이동] 이미지 조회 실패:', fetchError);
      return NextResponse.json({ error: '이미지 조회에 실패했습니다.' }, { status: 500 });
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ 
        message: '이동할 이미지가 없습니다.',
        shiftedCount: 0 
      });
    }

    // cut_index를 1씩 증가시킴 (역순으로 업데이트)
    let shiftedCount = 0;
    for (const image of images) {
      const newCutIndex = image.cut_index + 1;
      const { error: updateError } = await supabase
        .from('episode_script_storyboard_images')
        .update({ cut_index: newCutIndex })
        .eq('id', image.id);

      if (updateError) {
        console.error(`[이미지 이동] 이미지 cut_index 업데이트 실패 (id: ${image.id}):`, updateError);
        return NextResponse.json({ 
          error: `이미지 업데이트에 실패했습니다: ${updateError.message}` 
        }, { status: 500 });
      }
      shiftedCount++;
    }

    console.log(`[이미지 이동] ${shiftedCount}개 이미지의 cut_index를 1씩 증가시킴 (fromCutIndex: ${fromCutIndex})`);

    return NextResponse.json({
      message: `${shiftedCount}개 이미지를 이동했습니다.`,
      shiftedCount,
    });
  } catch (error) {
    console.error('[이미지 이동] 오류 발생:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}






