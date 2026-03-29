import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST: base64 이미지 → Storage 업로드 → shortstoon_blocks 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, imageData, mimeType, fileName, orderIndex } = body;

    if (!projectId || !imageData || !mimeType || !fileName || orderIndex === undefined) {
      return NextResponse.json(
        { error: 'projectId, imageData, mimeType, fileName, orderIndex 필요' },
        { status: 400 }
      );
    }

    const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');

    const timestamp = Date.now();
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100) || 'file';
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const fullFileName = `${timestamp}-${sanitized}.${ext}`;
    const storagePath = `shortstoon/${projectId}/${fullFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, binaryData, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[shortstoon/upload] Storage 업로드 실패:', uploadError);
      return NextResponse.json({ error: '파일 업로드 실패', details: uploadError }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    const { data, error: dbError } = await supabase
      .from('shortstoon_blocks')
      .insert({
        shortstoon_project_id: projectId,
        order_index: orderIndex,
        image_path: storagePath,
        image_url: publicUrl,
        file_name: fileName,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[shortstoon/upload] DB 저장 실패:', dbError);
      return NextResponse.json({ error: 'DB 저장 실패', details: dbError }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[shortstoon/upload] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '업로드 실패' },
      { status: 500 }
    );
  }
}
