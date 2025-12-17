import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createFile } from '@/lib/api/files';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    imageData: string;
    mimeType: string;
    fileName: string;
    cutId: string;
    processId: string;
    description?: string;
    createdBy?: string;
    sourceFileId?: string;
    prompt?: string | null;
    styleId?: string;
    styleKey?: string;
    styleName?: string;
  } | null;

  if (!body?.imageData || !body?.mimeType || !body?.fileName || !body?.cutId || !body?.processId) {
    return NextResponse.json(
      { error: 'imageData, mimeType, fileName, cutId, processId가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    // base64 to Buffer
    const base64Data = body.imageData.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');

    // 파일명 생성 (한글 제거 - Supabase Storage는 한글 파일명 지원 안함)
    const timestamp = Date.now();
    const sanitizedFileName = body.fileName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 100) || 'file';
    const ext = body.mimeType.split('/')[1] || 'png';
    const fullFileName = `${timestamp}-${sanitizedFileName}.${ext}`;
    const storagePath = `${body.cutId}/${body.processId}/${fullFileName}`;

    console.log('[files/upload][POST] 파일 업로드 시작', {
      cutId: body.cutId,
      processId: body.processId,
      fileName: body.fileName,
      storagePath,
      fileSize: binaryData.length,
      mimeType: body.mimeType,
    });

    // Supabase Storage에 업로드
    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, binaryData, {
        contentType: body.mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[files/upload][POST] Storage 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '파일 업로드에 실패했습니다.', details: uploadError },
        { status: 500 }
      );
    }

    // 공개 URL 가져오기
    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    console.log('[files/upload][POST] Storage 업로드 성공, DB 저장 시도', {
      cutId: body.cutId,
      processId: body.processId,
      storagePath,
      publicUrl,
    });

    // DB에 파일 정보 저장
    const file = await createFile({
      cut_id: body.cutId,
      process_id: body.processId,
      file_name: body.fileName,
      file_path: publicUrl,
      storage_path: storagePath,
      file_size: binaryData.length,
      file_type: body.mimeType.split('/')[0],
      mime_type: body.mimeType,
      description: body.description || '',
      metadata: {
        ...(body.styleId && { style_id: body.styleId }),
        ...(body.styleKey && { style_key: body.styleKey }),
        ...(body.styleName && { style_name: body.styleName }),
      },
      prompt: body.prompt || null,
      created_by: body.createdBy,
      source_file_id: body.sourceFileId,
    });

    console.log('[files/upload][POST] 파일 업로드 및 DB 저장 성공', {
      fileId: file.id,
      cutId: body.cutId,
      processId: body.processId,
    });

    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        file_name: file.file_name,
        file_path: file.file_path,
        storage_path: file.storage_path,
        file_type: file.file_type,
        mime_type: file.mime_type,
        file_size: file.file_size,
      },
    });
  } catch (error) {
    console.error('[files/upload][POST] 파일 업로드 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '파일 업로드에 실패했습니다.' },
      { status: 500 }
    );
  }
}

