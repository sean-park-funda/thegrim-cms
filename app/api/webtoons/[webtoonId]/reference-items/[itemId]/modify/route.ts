import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const FAL_KEY = process.env.FAL_KEY;
const FAL_QUEUE_URL = 'https://queue.fal.run/fal-ai/openai/gpt-image-2/edit';

type Params = Promise<{ webtoonId: string; itemId: string }> | { webtoonId: string; itemId: string };

// 기존 아이템을 베이스로 수정본 생성 (색상/핏 변경 등)
// 결과는 새 reference_item으로 저장 (parent_id = 원본)
export async function POST(request: NextRequest, { params }: { params: Params }) {
  if (!FAL_KEY) return NextResponse.json({ error: 'FAL_KEY 없음' }, { status: 500 });

  const { webtoonId, itemId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    instruction: string;   // 예: "색상을 검정으로 변경, 핏을 타이트하게"
    newName?: string;
  } | null;

  if (!body?.instruction?.trim()) {
    return NextResponse.json({ error: '수정 지시가 필요합니다.' }, { status: 400 });
  }

  // 원본 아이템 조회
  const { data: item, error: fetchError } = await supabase
    .from('reference_items')
    .select('*')
    .eq('id', itemId)
    .eq('webtoon_id', webtoonId)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: '아이템을 찾을 수 없습니다.' }, { status: 404 });
  }

  const prompt = [
    'You are a professional costume designer.',
    '',
    `TASK: Edit Image 1 (clothing/accessory reference). ${body.instruction}`,
    '',
    'KEEP UNCHANGED:',
    '- Overall garment type and silhouette (unless explicitly asked to change)',
    '- Image composition and background',
    '- Drawing/illustration style',
  ].join('\n');

  // fal.ai 큐 제출
  const response = await fetch(FAL_QUEUE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_urls: [item.file_path],
      image_size: { width: 1024, height: 1024 },
      quality: 'high',
      n: 1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: `fal.ai 실패: ${err}` }, { status: 500 });
  }

  const data = await response.json();
  return NextResponse.json({
    requestId: data.request_id,
    parentItem: item,
    newName: body.newName || `${item.name} (수정본)`,
  });
}
