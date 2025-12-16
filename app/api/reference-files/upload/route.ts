import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createReferenceFile } from '@/lib/api/referenceFiles';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    imageData: string;
    mimeType: string;
    fileName: string;
    webtoonId: string;
    processId: string;
    description?: string;
  } | null;

  if (!body?.imageData || !body?.mimeType || !body?.fileName || !body?.webtoonId || !body?.processId) {
    return NextResponse.json(
      { error: 'imageData, mimeType, fileName, webtoonId, processId가 필요합니다.' },
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
    const ext = body.mimeType.split('/')[1] || 'bin';
    const fullFileName = `${timestamp}-${sanitizedFileName}.${ext}`;
    const storagePath = `references/${body.webtoonId}/${body.processId}/${fullFileName}`;

    console.log('[reference-files/upload][POST] 레퍼런스 파일 업로드 시작', {
      webtoonId: body.webtoonId,
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
      console.error('[reference-files/upload][POST] Storage 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '파일 업로드에 실패했습니다.', details: uploadError },
        { status: 500 }
      );
    }

    // 공개 URL 가져오기
    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    console.log('[reference-files/upload][POST] Storage 업로드 성공, DB 저장 시도', {
      webtoonId: body.webtoonId,
      processId: body.processId,
      storagePath,
      publicUrl,
    });

    const fileType = body.mimeType.split('/')[0];

    // DB에 파일 정보 저장
    const file = await createReferenceFile({
      webtoon_id: body.webtoonId,
      process_id: body.processId,
      file_name: body.fileName,
      file_path: publicUrl,
      storage_path: storagePath,
      file_size: binaryData.length,
      file_type: fileType,
      mime_type: body.mimeType,
      description: body.description || '',
      metadata: {},
    });

    console.log('[reference-files/upload][POST] 레퍼런스 파일 업로드 및 DB 저장 성공', {
      fileId: file.id,
      webtoonId: body.webtoonId,
      processId: body.processId,
    });

    // 이미지 파일인 경우 썸네일 생성 (비동기 처리)
    if (fileType === 'image') {
      // 썸네일 생성은 비동기로 처리 (실패해도 업로드는 성공으로 처리)
      fetch('/api/generate-reference-thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: file.id,
        }),
      }).catch((error) => {
        console.error('[reference-files/upload][POST] 썸네일 생성 요청 실패:', error);
        // 썸네일 생성 실패는 무시
      });
    }

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
    console.error('[reference-files/upload][POST] 레퍼런스 파일 업로드 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '레퍼런스 파일 업로드에 실패했습니다.' },
      { status: 500 }
    );
  }
}

