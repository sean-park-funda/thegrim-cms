import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type Params = Promise<{ webtoonId: string }> | { webtoonId: string };

// 목록 조회
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId } = await Promise.resolve(params);
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'outfit' | 'prop' | null(전체)

  let query = supabase
    .from('reference_items')
    .select('*')
    .eq('webtoon_id', webtoonId)
    .order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// 새 아이템 생성 (base64 이미지 업로드)
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    imageData: string;
    mimeType: string;
    name: string;
    type: 'outfit' | 'prop';
    description?: string;
    tags?: string[];
    parentId?: string;
  } | null;

  if (!body?.imageData || !body?.mimeType || !body?.type) {
    return NextResponse.json({ error: 'imageData, mimeType, type이 필요합니다.' }, { status: 400 });
  }

  const ext = body.mimeType.split('/')[1] || 'png';
  const itemId = crypto.randomUUID();
  const storagePath = `reference-items/${webtoonId}/${itemId}.${ext}`;

  // Buffer로 변환
  const binaryData = Buffer.from(body.imageData, 'base64');
  const blob = new Blob([binaryData], { type: body.mimeType });

  // Storage 업로드
  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, blob, { contentType: body.mimeType, cacheControl: '3600', upsert: false });

  if (uploadError) {
    console.error('[reference-items] 업로드 실패:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from('webtoon-files').getPublicUrl(storagePath);

  // DB 저장
  const { data, error: dbError } = await supabase
    .from('reference_items')
    .insert({
      webtoon_id: webtoonId,
      type: body.type,
      name: body.name || '이름 없음',
      description: body.description || null,
      tags: body.tags || [],
      file_path: publicUrl,
      storage_path: storagePath,
      file_size: binaryData.length,
      parent_id: body.parentId || null,
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('webtoon-files').remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
