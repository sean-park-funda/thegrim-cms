import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PATCH /api/movie/[projectId]/scenes/[sceneId] - 씬 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;

  try {
    const body = await request.json().catch(() => null) as {
      duration?: number;
      video_prompt?: string;
    } | null;

    if (!body) {
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.duration !== undefined) {
      // duration은 4, 6, 8만 허용
      if (![4, 6, 8].includes(body.duration)) {
        return NextResponse.json(
          { error: 'Duration must be 4, 6, or 8 seconds' },
          { status: 400 }
        );
      }
      updateData.duration = body.duration;
    }

    if (body.video_prompt !== undefined) {
      updateData.video_prompt = body.video_prompt;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('movie_scenes')
      .update(updateData)
      .eq('id', sceneId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('[movie][scenes][PATCH] 업데이트 실패:', error);
      return NextResponse.json(
        { error: 'Failed to update scene' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[movie][scenes][PATCH] 오류:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
