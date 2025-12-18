import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: /api/shorts/[projectId]/characters - 캐릭터 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][characters][GET] 캐릭터 목록 조회:', projectId);

  const { data, error } = await supabase
    .from('shorts_characters')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[shorts][characters][GET] 조회 실패:', error);
    return NextResponse.json({ error: '캐릭터 조회에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST: /api/shorts/[projectId]/characters - 캐릭터 추가
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][characters][POST] 캐릭터 추가:', projectId);

  const body = await request.json().catch(() => null) as {
    name?: string;
    description?: string;
    imageBase64?: string;
    imageMimeType?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: '캐릭터 이름이 필요합니다.' }, { status: 400 });
  }

  let imagePath: string | null = null;
  let storagePath: string | null = null;

  // 이미지가 있으면 Supabase Storage에 업로드
  if (body?.imageBase64) {
    const mimeType = body.imageMimeType || 'image/png';
    const extension = mimeType.split('/')[1] || 'png';
    const fileName = `${projectId}/${Date.now()}-${name}.${extension}`;
    storagePath = fileName;

    const imageBuffer = Buffer.from(body.imageBase64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('shorts-videos')
      .upload(fileName, imageBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[shorts][characters][POST] 이미지 업로드 실패:', uploadError);
      return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('shorts-videos')
      .getPublicUrl(fileName);

    imagePath = urlData.publicUrl;
  }

  const { data, error } = await supabase
    .from('shorts_characters')
    .insert({
      project_id: projectId,
      name,
      description: body?.description || null,
      image_path: imagePath,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (error) {
    console.error('[shorts][characters][POST] 생성 실패:', error);
    return NextResponse.json({ error: '캐릭터 추가에 실패했습니다.' }, { status: 500 });
  }

  // 프로젝트 상태 업데이트
  await supabase
    .from('shorts_projects')
    .update({ status: 'characters_set' })
    .eq('id', projectId)
    .eq('status', 'draft');

  return NextResponse.json(data, { status: 201 });
}

// PUT: /api/shorts/[projectId]/characters - 캐릭터 일괄 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  console.log('[shorts][characters][PUT] 캐릭터 일괄 업데이트:', projectId);

  const body = await request.json().catch(() => null) as {
    characters?: Array<{
      name: string;
      description?: string;
      imageBase64?: string;
      imageMimeType?: string;
    }>;
  } | null;

  if (!body?.characters || !Array.isArray(body.characters)) {
    return NextResponse.json({ error: 'characters 배열이 필요합니다.' }, { status: 400 });
  }

  // 기존 캐릭터 삭제
  await supabase
    .from('shorts_characters')
    .delete()
    .eq('project_id', projectId);

  // 새 캐릭터 추가
  const charactersToInsert = [];

  for (const char of body.characters) {
    if (!char.name?.trim()) continue;

    let imagePath: string | null = null;
    let storagePath: string | null = null;

    if (char.imageBase64) {
      const mimeType = char.imageMimeType || 'image/png';
      const extension = mimeType.split('/')[1] || 'png';
      const fileName = `${projectId}/${Date.now()}-${char.name}.${extension}`;
      storagePath = fileName;

      const imageBuffer = Buffer.from(char.imageBase64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('shorts-videos')
        .upload(fileName, imageBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('shorts-videos')
          .getPublicUrl(fileName);
        imagePath = urlData.publicUrl;
      }
    }

    charactersToInsert.push({
      project_id: projectId,
      name: char.name.trim(),
      description: char.description || null,
      image_path: imagePath,
      storage_path: storagePath,
    });
  }

  if (charactersToInsert.length > 0) {
    const { error } = await supabase
      .from('shorts_characters')
      .insert(charactersToInsert);

    if (error) {
      console.error('[shorts][characters][PUT] 생성 실패:', error);
      return NextResponse.json({ error: '캐릭터 저장에 실패했습니다.' }, { status: 500 });
    }
  }

  // 프로젝트 상태 업데이트
  await supabase
    .from('shorts_projects')
    .update({ status: 'characters_set' })
    .eq('id', projectId);

  // 업데이트된 캐릭터 목록 반환
  const { data: updatedCharacters } = await supabase
    .from('shorts_characters')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  return NextResponse.json(updatedCharacters ?? []);
}
