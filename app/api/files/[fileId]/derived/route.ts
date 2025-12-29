import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface DerivedImage {
  fileId: string;
  filePath: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
  mimeType: string;
  prompt?: string;
  description?: string;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  process?: {
    id: string;
    name: string;
    color: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const startTime = Date.now();
  const { fileId } = await params;
  
  console.log('[파생 이미지 조회] 조회 시작:', { fileId });

  try {
    const { searchParams } = new URL(request.url);
    const currentUserId = searchParams.get('currentUserId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 1. 전체 개수 조회
    let countQuery = supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('source_file_id', fileId);

    // 공개/비공개 필터링: 공개 이미지이거나 본인이 생성한 이미지
    if (currentUserId) {
      countQuery = countQuery.or(`is_public.eq.true,created_by.eq.${currentUserId}`);
    } else {
      countQuery = countQuery.eq('is_public', true);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('[파생 이미지 조회] 전체 개수 조회 실패:', countError);
    }

    // 2. 파생 이미지 목록 조회
    let query = supabase
      .from('files')
      .select(`
        id,
        file_name,
        file_path,
        storage_path,
        created_at,
        mime_type,
        prompt,
        description,
        is_public,
        created_by,
        metadata,
        process:processes (
          id,
          name,
          color
        )
      `)
      .eq('source_file_id', fileId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 공개/비공개 필터링
    if (currentUserId) {
      query = query.or(`is_public.eq.true,created_by.eq.${currentUserId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data: files, error: dbError } = await query;

    if (dbError) {
      console.error('[파생 이미지 조회] DB 조회 실패:', dbError);
      return NextResponse.json(
        { error: '파생 이미지 목록을 조회할 수 없습니다.' },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      console.log('[파생 이미지 조회] 파생 이미지 없음');
      return NextResponse.json({
        derivedImages: [],
        total: 0,
      });
    }

    // 3. 생성자 정보 별도 조회
    const creatorIds = files
      .map(f => f.created_by)
      .filter((id): id is string => id !== null && id !== undefined);

    let creatorsMap = new Map();
    if (creatorIds.length > 0) {
      const { data: creators, error: creatorsError } = await supabase
        .from('user_profiles')
        .select('id, email, name')
        .in('id', creatorIds);

      if (!creatorsError && creators) {
        creatorsMap = new Map(creators.map(c => [c.id, c]));
      }
    }

    // 4. 응답 형식 변환
    const derivedImages: DerivedImage[] = files.map(file => {
      const creatorData = file.created_by ? creatorsMap.get(file.created_by) : null;
      const processData = file.process
        ? (Array.isArray(file.process) ? file.process[0] : file.process)
        : null;

      return {
        fileId: file.id,
        filePath: file.storage_path,
        fileUrl: file.file_path,
        fileName: file.file_name,
        createdAt: file.created_at,
        mimeType: file.mime_type || 'image/png',
        prompt: file.prompt || undefined,
        description: file.description || undefined,
        isPublic: file.is_public ?? true,
        metadata: file.metadata || undefined,
        creator: creatorData ? {
          id: creatorData.id,
          name: creatorData.name || '',
          email: creatorData.email || '',
        } : undefined,
        process: processData ? {
          id: processData.id,
          name: processData.name,
          color: processData.color,
        } : undefined,
      };
    });

    const totalTime = Date.now() - startTime;
    console.log('[파생 이미지 조회] 조회 완료:', {
      fileId,
      totalItems: derivedImages.length,
      totalCount: totalCount || 0,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({
      derivedImages,
      total: totalCount || 0,
      offset,
      limit,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[파생 이미지 조회] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '파생 이미지 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

