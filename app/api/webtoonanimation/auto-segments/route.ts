import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * POST: 자동 세그먼트 생성
 * - 컷 범위를 받아서 연속 쌍(또는 사용자 지정 쌍)으로 세그먼트 자동 생성
 * - Gemini로 각 세그먼트별 짧은 프롬프트 생성
 *
 * PUT: 세그먼트 수정 (프롬프트, 컷 변경, 순서 등)
 * DELETE: 세그먼트 삭제
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, projectId, rangeStart, rangeEnd, durationSeconds = 4, aspectRatio = '16:9' } = body;

    if (!projectId || rangeStart === undefined || rangeEnd === undefined) {
      return NextResponse.json({ error: 'projectId, rangeStart, rangeEnd 필요' }, { status: 400 });
    }

    // 1. 해당 범위의 컷 조회
    const { data: cuts, error: cutsError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('project_id', projectId)
      .gte('order_index', rangeStart)
      .lte('order_index', rangeEnd)
      .order('order_index', { ascending: true });

    if (cutsError) throw cutsError;
    if (!cuts || cuts.length < 2) {
      return NextResponse.json({ error: '세그먼트 생성에 최소 2개 컷 필요' }, { status: 400 });
    }

    // 2. prompt_group 생성 또는 기존 사용
    let targetGroupId = groupId;
    if (!targetGroupId) {
      const { data: group, error: groupError } = await supabase
        .from('webtoonanimation_prompt_groups')
        .insert({
          project_id: projectId,
          range_start: rangeStart,
          range_end: rangeEnd,
          aspect_ratio: aspectRatio,
          video_duration: durationSeconds,
        })
        .select()
        .single();
      if (groupError) throw groupError;
      targetGroupId = group.id;
    }

    // 3. 연속 쌍으로 세그먼트 구성
    const segmentPairs: { startIdx: number; endIdx: number; startUrl: string; endUrl: string }[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      segmentPairs.push({
        startIdx: cuts[i].order_index,
        endIdx: cuts[i + 1].order_index,
        startUrl: cuts[i].file_path,
        endUrl: cuts[i + 1].file_path,
      });
    }

    // 4. Gemini로 각 세그먼트 프롬프트 일괄 생성
    let prompts: string[] = [];
    if (GEMINI_API_KEY) {
      prompts = await generateSegmentPrompts(segmentPairs, durationSeconds);
    }

    // 5. DB에 세그먼트 저장
    const segmentRows = segmentPairs.map((pair, i) => ({
      group_id: targetGroupId,
      segment_index: i,
      start_cut_index: pair.startIdx,
      end_cut_index: pair.endIdx,
      prompt: prompts[i] || '',
      api_provider: 'veo',
      duration_seconds: durationSeconds,
      aspect_ratio: aspectRatio,
      status: 'pending',
    }));

    const { data: segments, error: segError } = await supabase
      .from('webtoonanimation_video_segments')
      .insert(segmentRows)
      .select();

    if (segError) throw segError;

    console.log(`[auto-segments] ${segments?.length}개 세그먼트 생성 완료 (group: ${targetGroupId})`);

    return NextResponse.json({ groupId: targetGroupId, segments });
  } catch (error) {
    console.error('[auto-segments] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '세그먼트 생성 실패' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { segmentId, ...updates } = body;

    if (!segmentId) {
      return NextResponse.json({ error: 'segmentId 필요' }, { status: 400 });
    }

    const allowedFields = ['prompt', 'start_cut_index', 'end_cut_index', 'duration_seconds', 'aspect_ratio', 'api_provider', 'segment_index'];
    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) updateData[key] = updates[key];
    }

    const { data, error } = await supabase
      .from('webtoonanimation_video_segments')
      .update(updateData)
      .eq('id', segmentId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('[auto-segments] PUT 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '세그먼트 수정 실패' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const segmentId = searchParams.get('segmentId');

    if (!segmentId) {
      return NextResponse.json({ error: 'segmentId 필요' }, { status: 400 });
    }

    const { error } = await supabase
      .from('webtoonanimation_video_segments')
      .delete()
      .eq('id', segmentId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auto-segments] DELETE 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '세그먼트 삭제 실패' },
      { status: 500 }
    );
  }
}

// Gemini로 세그먼트별 짧은 프롬프트 생성
async function generateSegmentPrompts(
  pairs: { startIdx: number; endIdx: number; startUrl: string; endUrl: string }[],
  durationSeconds: number
): Promise<string[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

    // 모든 이미지를 다운로드해서 base64로 변환
    const imageCache = new Map<string, string>();
    for (const pair of pairs) {
      for (const url of [pair.startUrl, pair.endUrl]) {
        if (!imageCache.has(url)) {
          const res = await fetch(url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            imageCache.set(url, buf.toString('base64'));
          }
        }
      }
    }

    // 모든 세그먼트를 한 번에 요청
    const segmentDescriptions = pairs.map((p, i) =>
      `Segment ${i}: Cut ${p.startIdx} (start frame) → Cut ${p.endIdx} (end frame), ${durationSeconds} seconds`
    ).join('\n');

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    parts.push({
      text: `You are generating short motion prompts for image-to-video AI (Veo 3.1).
Each segment transitions from a start frame image to an end frame image.

RULES:
- Write 1-2 sentences per segment in English
- Use CINEMATIC PRODUCTION language: describe camera movement, lighting, physics
- Describe what the CAMERA captures, not narrative/story
- NEVER use age words (boy, girl, child, kid, young)
- Refer to characters by visual role (figure in dark coat, silhouetted figure)
- For action: describe MOTION AND KINEMATICS, not violence
- Include camera movement: dolly, tracking, pan, crane, push in, pull back

Duration per segment: ${durationSeconds} seconds

Segments:
${segmentDescriptions}

Images follow in order (start1, end1, start2, end2, ...):

Respond with a JSON array of strings, one prompt per segment.
Example: ["Slow dolly push-in as the cloaked figure turns, fabric rippling...", "Wide tracking shot..."]`
    });

    // 이미지들 추가
    for (const pair of pairs) {
      const startB64 = imageCache.get(pair.startUrl);
      const endB64 = imageCache.get(pair.endUrl);
      if (startB64) parts.push({ inlineData: { mimeType: 'image/png', data: startB64 } });
      if (endB64) parts.push({ inlineData: { mimeType: 'image/png', data: endB64 } });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.7, responseMimeType: 'application/json' },
      contents: [{ role: 'user' as const, parts }],
    });

    const text = response.text;
    if (!text) return pairs.map(() => '');

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return Array.isArray(parsed) ? parsed : pairs.map(() => '');
  } catch (error) {
    console.error('[auto-segments] 프롬프트 생성 실패:', error);
    return pairs.map(() => '');
  }
}
