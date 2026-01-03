import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// PATCH: 배경 정보 수정 (프롬프트 등)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; backgroundId: string }> }
) {
  const { projectId, backgroundId } = await params;

  console.log('[background-update] 요청:', { projectId, backgroundId });

  try {
    const body = await request.json();
    const { name, image_prompt } = body;

    // 업데이트할 필드 구성
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (image_prompt !== undefined) updateData.image_prompt = image_prompt;

    // 배경 업데이트
    const { data: updatedBackground, error: updateError } = await supabase
      .from('movie_backgrounds')
      .update(updateData)
      .eq('id', backgroundId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('[background-update] 업데이트 실패:', updateError);
      return NextResponse.json(
        { error: '배경 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!updatedBackground) {
      return NextResponse.json(
        { error: '배경을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('[background-update] 완료:', { backgroundId, name: updatedBackground.name });

    return NextResponse.json({ background: updatedBackground });
  } catch (error) {
    console.error('[background-update] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배경 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 배경 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; backgroundId: string }> }
) {
  const { projectId, backgroundId } = await params;

  console.log('[background-delete] 요청:', { projectId, backgroundId });

  try {
    // 배경 정보 먼저 가져오기 (스토리지 삭제용)
    const { data: background } = await supabase
      .from('movie_backgrounds')
      .select('storage_path')
      .eq('id', backgroundId)
      .eq('project_id', projectId)
      .single();

    // 스토리지에서 이미지 삭제
    if (background?.storage_path) {
      await supabase.storage
        .from('movie-videos')
        .remove([background.storage_path]);
    }

    // DB에서 배경 삭제
    const { error: deleteError } = await supabase
      .from('movie_backgrounds')
      .delete()
      .eq('id', backgroundId)
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('[background-delete] 삭제 실패:', deleteError);
      return NextResponse.json(
        { error: '배경 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[background-delete] 완료:', { backgroundId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[background-delete] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배경 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
