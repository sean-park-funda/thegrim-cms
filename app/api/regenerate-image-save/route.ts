import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import sharp from 'sharp';

interface SaveRegeneratedImageRequest {
  fileId: string; // 임시 파일 ID (DB에 저장된)
  processId?: string; // 공정 ID (변경하려는 경우, 선택적)
  cutId?: string; // 컷 ID (공정 선택용)
  episodeId?: string; // 회차 ID (공정 선택용)
  fileName?: string; // 파일명 (변경하려는 경우, 선택적)
  description?: string; // 설명 (업데이트하려는 경우, 선택적)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 저장] 임시 파일을 영구 파일로 전환 시작 (DB 업데이트만 수행)');

  try {
    const body: SaveRegeneratedImageRequest = await request.json();
    const { fileId, processId, cutId, episodeId, fileName, description } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 임시 파일 정보 조회
    console.log('[이미지 저장] 임시 파일 정보 조회 시작:', fileId);
    const { data: tempFile, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !tempFile) {
      console.error('[이미지 저장] 임시 파일 조회 실패:', fileError);
      return NextResponse.json(
        { error: '임시 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (!tempFile.is_temp) {
      console.warn('[이미지 저장] 이미 영구 파일입니다:', fileId);
      return NextResponse.json(
        { error: '이미 영구 파일로 저장된 파일입니다.' },
        { status: 400 }
      );
    }

    // processId는 필수 (사용자가 선택해야 함)
    if (!processId) {
      return NextResponse.json(
        { error: '공정을 선택해주세요.' },
        { status: 400 }
      );
    }
    
    const finalProcessId = processId;

    // 업데이트할 데이터 준비
    const updateData: {
      is_temp: boolean;
      process_id?: string;
      file_name?: string;
      description?: string;
    } = {
      is_temp: false,
    };

    if (finalProcessId) {
      updateData.process_id = finalProcessId;
      // processId가 변경되면 storage_path도 업데이트 필요
      // 하지만 파일 이동은 하지 않으므로, storage_path는 그대로 유지
      // 필요시 나중에 파일 이동 로직 추가 가능
    }

    if (fileName) {
      updateData.file_name = fileName;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    // DB에서 is_temp = false로 업데이트 (파일 이동 불필요)
    console.log('[이미지 저장] DB 업데이트 시작:', updateData);
    const { data: fileData, error: dbError } = await supabase
      .from('files')
      .update(updateData)
      .eq('id', fileId)
      .select()
      .single();

    if (dbError || !fileData) {
      console.error('[이미지 저장] DB 업데이트 실패:', dbError);
      return NextResponse.json(
        { error: '파일 정보 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[이미지 저장] 임시 파일을 영구 파일로 전환 완료:', {
      fileId: fileData.id,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({
      file: fileData,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 저장] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '이미지 저장 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      },
      { status: 500 }
    );
  }
}

