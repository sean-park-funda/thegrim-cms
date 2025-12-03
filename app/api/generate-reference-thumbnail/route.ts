import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용 권장)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface GenerateReferenceThumbnailRequest {
  fileId: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[레퍼런스 썸네일 생성] 요청 시작');

  try {
    const body: GenerateReferenceThumbnailRequest = await request.json();
    const { fileId } = body;

    if (!fileId) {
      console.error('[레퍼런스 썸네일 생성] fileId가 없음');
      return NextResponse.json(
        { error: 'fileId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 레퍼런스 파일 정보 조회
    console.log('[레퍼런스 썸네일 생성] 파일 정보 조회:', fileId);
    const { data: file, error: fetchError } = await supabase
      .from('reference_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !file) {
      console.error('[레퍼런스 썸네일 생성] 파일 조회 실패:', fetchError);
      return NextResponse.json(
        { error: '레퍼런스 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이미지 파일인지 확인
    if (file.file_type !== 'image') {
      console.error('[레퍼런스 썸네일 생성] 이미지 파일이 아님:', file.file_type);
      return NextResponse.json(
        { error: '이미지 파일만 썸네일을 생성할 수 있습니다.' },
        { status: 400 }
      );
    }

    // 이미 썸네일이 있는지 확인
    if (file.thumbnail_path) {
      console.log('[레퍼런스 썸네일 생성] 이미 썸네일이 존재함:', file.thumbnail_path);
      const { data: thumbnailUrlData } = supabase.storage
        .from('webtoon-files')
        .getPublicUrl(file.thumbnail_path);
      return NextResponse.json({
        thumbnailUrl: thumbnailUrlData.publicUrl,
        thumbnailPath: file.thumbnail_path,
        message: '이미 썸네일이 존재합니다.'
      });
    }

    // 원본 이미지 다운로드
    console.log('[레퍼런스 썸네일 생성] 원본 이미지 다운로드 시작:', file.file_path);
    const imageResponse = await fetch(file.file_path);

    if (!imageResponse.ok) {
      console.error('[레퍼런스 썸네일 생성] 이미지 다운로드 실패:', {
        status: imageResponse.status,
        statusText: imageResponse.statusText
      });
      return NextResponse.json(
        { error: '원본 이미지를 가져올 수 없습니다.' },
        { status: 400 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageSize = imageBuffer.byteLength;
    console.log('[레퍼런스 썸네일 생성] 이미지 다운로드 완료:', {
      size: imageSize,
      filePath: file.file_path
    });

    // 썸네일 생성 (최대 너비 400px, 품질 80%, 비율 유지)
    console.log('[레퍼런스 썸네일 생성] 썸네일 생성 시작...');
    const thumbnailBuffer = await sharp(Buffer.from(imageBuffer))
      .resize(400, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailSize = thumbnailBuffer.length;
    console.log('[레퍼런스 썸네일 생성] 썸네일 생성 완료:', {
      originalSize: imageSize,
      thumbnailSize,
      compressionRatio: ((1 - thumbnailSize / imageSize) * 100).toFixed(1) + '%'
    });

    // 썸네일 Storage 경로 생성
    // 원본: references/{webtoonId}/{processId}/{fileName}
    // 썸네일: references/{webtoonId}/{processId}/thumbnails/{fileName}
    const originalPathParts = file.storage_path.split('/');
    const fileName = originalPathParts[originalPathParts.length - 1];
    const thumbnailPath = `${originalPathParts[0]}/${originalPathParts[1]}/${originalPathParts[2]}/thumbnails/${fileName}`;

    // Storage에 썸네일 업로드
    console.log('[레퍼런스 썸네일 생성] Storage 업로드 시작:', thumbnailPath);
    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        upsert: true // 이미 있으면 덮어쓰기
      });

    if (uploadError) {
      console.error('[레퍼런스 썸네일 생성] Storage 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '썸네일 업로드에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[레퍼런스 썸네일 생성] Storage 업로드 완료');

    // DB에 thumbnail_path 업데이트
    console.log('[레퍼런스 썸네일 생성] DB 업데이트 시작...');
    const { error: updateError } = await supabase
      .from('reference_files')
      .update({ thumbnail_path: thumbnailPath })
      .eq('id', fileId);

    if (updateError) {
      console.error('[레퍼런스 썸네일 생성] DB 업데이트 실패:', updateError);
      // Storage 업로드는 성공했지만 DB 업데이트 실패 시 Storage에서 삭제
      await supabase.storage
        .from('webtoon-files')
        .remove([thumbnailPath]);
      return NextResponse.json(
        { error: '썸네일 정보 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[레퍼런스 썸네일 생성] DB 업데이트 완료');

    // 썸네일 공개 URL 생성
    const { data: thumbnailUrlData } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(thumbnailPath);

    const totalTime = Date.now() - startTime;
    console.log('[레퍼런스 썸네일 생성] 완료:', {
      totalTime: `${totalTime}ms`,
      thumbnailPath,
      thumbnailUrl: thumbnailUrlData.publicUrl
    });

    return NextResponse.json({
      thumbnailUrl: thumbnailUrlData.publicUrl,
      thumbnailPath,
      message: '썸네일이 성공적으로 생성되었습니다.'
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[레퍼런스 썸네일 생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '썸네일 생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      },
      { status: 500 }
    );
  }
}

