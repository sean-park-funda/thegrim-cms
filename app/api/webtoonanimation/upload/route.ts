import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, imageData, mimeType, fileName, orderIndex } = body;

    if (!projectId || !imageData || !mimeType || !fileName || orderIndex === undefined) {
      return NextResponse.json(
        { error: 'projectId, imageData, mimeType, fileName, orderIndex가 필요합니다.' },
        { status: 400 }
      );
    }

    const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');

    const timestamp = Date.now();
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100) || 'file';
    const ext = mimeType.split('/')[1] || 'png';
    const fullFileName = `${timestamp}-${sanitizedFileName}.${ext}`;
    const storagePath = `webtoonanimation/${projectId}/${fullFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, binaryData, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[webtoonanimation/upload] Storage 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '파일 업로드 실패', details: uploadError },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    const { data, error: dbError } = await supabase
      .from('webtoonanimation_cuts')
      .insert({
        project_id: projectId,
        order_index: orderIndex,
        file_name: fileName,
        file_path: publicUrl,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[webtoonanimation/upload] DB 저장 실패:', dbError);
      return NextResponse.json(
        { error: 'DB 저장 실패', details: dbError },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[webtoonanimation/upload] 업로드 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '업로드 실패' },
      { status: 500 }
    );
  }
}
