import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// PATCH: 컷 정보 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; cutId: string }> }
) {
  const { projectId, cutId } = await params;

  console.log('[cut-update] 요청:', { projectId, cutId });

  try {
    const body = await request.json();
    const { image_prompt, characters, background_id, background_name, dialogue, duration } = body;

    // 업데이트할 필드 구성
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (image_prompt !== undefined) updateData.image_prompt = image_prompt;
    if (characters !== undefined) updateData.characters = characters;
    if (background_id !== undefined) updateData.background_id = background_id;
    if (background_name !== undefined) updateData.background_name = background_name;
    if (dialogue !== undefined) updateData.dialogue = dialogue;
    if (duration !== undefined) updateData.duration = duration;

    // 컷 업데이트
    const { data: updatedCut, error: updateError } = await supabase
      .from('movie_cuts')
      .update(updateData)
      .eq('id', cutId)
      .eq('project_id', projectId)
      .select(`
        *,
        background:movie_backgrounds(id, name, image_path)
      `)
      .single();

    if (updateError) {
      console.error('[cut-update] 업데이트 실패:', updateError);
      return NextResponse.json(
        { error: '컷 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!updatedCut) {
      return NextResponse.json(
        { error: '컷을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('[cut-update] 완료:', { cutId });

    return NextResponse.json({ cut: updatedCut });
  } catch (error) {
    console.error('[cut-update] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '컷 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 컷 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; cutId: string }> }
) {
  const { projectId, cutId } = await params;

  console.log('[cut-delete] 요청:', { projectId, cutId });

  try {
    // 컷 정보 먼저 가져오기 (스토리지 삭제용)
    const { data: cut } = await supabase
      .from('movie_cuts')
      .select('storage_path')
      .eq('id', cutId)
      .eq('project_id', projectId)
      .single();

    // 스토리지에서 이미지 삭제
    if (cut?.storage_path) {
      await supabase.storage
        .from('movie-videos')
        .remove([cut.storage_path]);
    }

    // DB에서 컷 삭제
    const { error: deleteError } = await supabase
      .from('movie_cuts')
      .delete()
      .eq('id', cutId)
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('[cut-delete] 삭제 실패:', deleteError);
      return NextResponse.json(
        { error: '컷 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 남은 컷들의 인덱스 재정렬
    const { data: remainingCuts } = await supabase
      .from('movie_cuts')
      .select('id, cut_index')
      .eq('project_id', projectId)
      .order('cut_index');

    if (remainingCuts && remainingCuts.length > 0) {
      for (let i = 0; i < remainingCuts.length; i++) {
        if (remainingCuts[i].cut_index !== i + 1) {
          await supabase
            .from('movie_cuts')
            .update({ cut_index: i + 1 })
            .eq('id', remainingCuts[i].id);
        }
      }
    }

    console.log('[cut-delete] 완료:', { cutId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[cut-delete] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '컷 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
