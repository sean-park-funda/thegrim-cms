import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// 캐릭터 정보 수정 (프롬프트, 설명 등)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; characterId: string }> }
) {
  const { projectId, characterId } = await params;

  console.log('[character-update] 요청:', { projectId, characterId });

  try {
    const body = await request.json();
    const { name, description, image_prompt } = body;

    // 업데이트할 필드 구성
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (image_prompt !== undefined) updateData.image_prompt = image_prompt;

    // 캐릭터 업데이트
    const { data: updatedCharacter, error: updateError } = await supabase
      .from('movie_characters')
      .update(updateData)
      .eq('id', characterId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('[character-update] 업데이트 실패:', updateError);
      return NextResponse.json(
        { error: '캐릭터 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!updatedCharacter) {
      return NextResponse.json(
        { error: '캐릭터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('[character-update] 완료:', { characterId, name: updatedCharacter.name });

    return NextResponse.json({ character: updatedCharacter });
  } catch (error) {
    console.error('[character-update] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '캐릭터 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 캐릭터 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; characterId: string }> }
) {
  const { projectId, characterId } = await params;

  console.log('[character-delete] 요청:', { projectId, characterId });

  try {
    // 캐릭터 정보 먼저 가져오기 (스토리지 삭제용)
    const { data: character } = await supabase
      .from('movie_characters')
      .select('storage_path')
      .eq('id', characterId)
      .eq('project_id', projectId)
      .single();

    // 스토리지에서 이미지 삭제
    if (character?.storage_path) {
      await supabase.storage
        .from('movie-videos')
        .remove([character.storage_path]);
    }

    // DB에서 캐릭터 삭제
    const { error: deleteError } = await supabase
      .from('movie_characters')
      .delete()
      .eq('id', characterId)
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('[character-delete] 삭제 실패:', deleteError);
      return NextResponse.json(
        { error: '캐릭터 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[character-delete] 완료:', { characterId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[character-delete] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '캐릭터 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
