import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, prompt, camera, continuity, duration, groupId, aspect_ratio, seedance_prompt, video_duration } = body;

    if (groupId) {
      const groupUpdates: Record<string, unknown> = {};
      if (aspect_ratio !== undefined) groupUpdates.aspect_ratio = aspect_ratio;
      if (seedance_prompt !== undefined) groupUpdates.seedance_prompt = seedance_prompt;
      if (video_duration !== undefined) groupUpdates.video_duration = video_duration;

      if (Object.keys(groupUpdates).length > 0) {
        const { error } = await supabase
          .from('webtoonanimation_prompt_groups')
          .update(groupUpdates)
          .eq('id', groupId);
        if (error) throw error;
      }
    }

    if (id) {
      const updates: Record<string, unknown> = { is_edited: true };
      if (prompt !== undefined) updates.prompt = prompt;
      if (camera !== undefined) updates.camera = camera;
      if (continuity !== undefined) updates.continuity = continuity;
      if (duration !== undefined) updates.duration = duration;

      const { data, error } = await supabase
        .from('webtoonanimation_cut_prompts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[webtoonanimation/update-prompt] 수정 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 수정 실패' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const cutId = searchParams.get('cutId');
    const projectId = searchParams.get('projectId');

    if (cutId) {
      const { data: cut } = await supabase
        .from('webtoonanimation_cuts')
        .select('storage_path')
        .eq('id', cutId)
        .single();

      if (cut?.storage_path) {
        await supabase.storage.from('webtoon-files').remove([cut.storage_path]);
      }

      const { error } = await supabase
        .from('webtoonanimation_cuts')
        .delete()
        .eq('id', cutId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (id) {
      const { error } = await supabase
        .from('webtoonanimation_prompt_groups')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (projectId) {
      const { error } = await supabase
        .from('webtoonanimation_projects')
        .delete()
        .eq('id', projectId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'id, cutId, 또는 projectId가 필요합니다.' }, { status: 400 });
  } catch (error) {
    console.error('[webtoonanimation/update-prompt] 삭제 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제 실패' },
      { status: 500 }
    );
  }
}
