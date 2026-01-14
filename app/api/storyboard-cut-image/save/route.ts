/**
 * 야콘티 이미지 저장 API
 * 
 * POST /api/storyboard-cut-image/save
 * Body: { storyboardId: string, cutIndex: number, imageUrl: string }
 * 
 * 이미 생성된 이미지 URL을 받아서 storyboard_images 테이블에 저장합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface SaveImageRequest {
  storyboardId: string;
  cutIndex: number;
  imageUrl: string;
}

export async function POST(request: NextRequest) {
  console.log('[storyboard-cut-image/save] 요청 시작');

  try {
    const body: SaveImageRequest = await request.json();
    const { storyboardId, cutIndex, imageUrl } = body;

    if (!storyboardId || cutIndex === undefined || !imageUrl) {
      return NextResponse.json(
        { error: 'storyboardId, cutIndex, imageUrl이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('[storyboard-cut-image/save] 이미지 다운로드 시작:', imageUrl);

    // 이미지 URL에서 데이터 다운로드
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`이미지 다운로드 실패: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    console.log('[storyboard-cut-image/save] 이미지 다운로드 완료:', {
      size: imageBuffer.byteLength,
      contentType,
    });

    // 기존 이미지 삭제 (같은 storyboard_id와 cut_index의 이미지)
    const { error: deleteError } = await supabase
      .from('episode_script_storyboard_images')
      .delete()
      .eq('storyboard_id', storyboardId)
      .eq('cut_index', cutIndex);

    if (deleteError) {
      console.error('[storyboard-cut-image/save] 기존 이미지 삭제 실패:', deleteError);
      // 삭제 실패해도 계속 진행
    }

    // 새 이미지 삽입
    const { error: insertError, data: insertedData } = await supabase
      .from('episode_script_storyboard_images')
      .insert({
        storyboard_id: storyboardId,
        cut_index: cutIndex,
        mime_type: contentType,
        image_base64: base64,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[storyboard-cut-image/save] 이미지 삽입 실패:', insertError);
      return NextResponse.json(
        { error: '이미지 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[storyboard-cut-image/save] 이미지 저장 완료:', {
      id: insertedData?.id,
      storyboardId,
      cutIndex,
    });

    return NextResponse.json({
      success: true,
      imageId: insertedData?.id,
      imageUrl, // 원본 URL 반환
    });
  } catch (error) {
    console.error('[storyboard-cut-image/save] 오류 발생:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
