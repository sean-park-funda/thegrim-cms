import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface GetRegenerateImageHistoryRequest {
  sourceFileId?: string; // 원본 파일 ID (선택적)
  userId?: string; // 사용자 ID (선택적)
  limit?: number; // 최대 개수 (기본값: 50)
  offset?: number; // 오프셋 (기본값: 0)
  before?: string; // 특정 시간 이전의 이미지 조회 (ISO 8601 형식) - 하위 호환성 유지
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성 히스토리] 히스토리 조회 시작');

  try {
    const { searchParams } = new URL(request.url);
    const sourceFileId = searchParams.get('sourceFileId') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const before = searchParams.get('before') || undefined;
    
    console.log('[이미지 재생성 히스토리] AI 생성 파일 목록 조회 시작:', {
      sourceFileId,
      userId,
      limit,
      offset,
      before,
    });

    // 전체 개수 조회 (필터링 조건 동일하게 적용)
    // AI로 생성된 파일 (prompt가 있는 파일)을 모두 포함
    let countQuery = supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .not('prompt', 'is', null);

    if (sourceFileId) {
      countQuery = countQuery.eq('source_file_id', sourceFileId);
    }

    if (userId) {
      countQuery = countQuery.eq('created_by', userId);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('[이미지 재생성 히스토리] 전체 개수 조회 실패:', countError);
    }

    // DB에서 AI로 생성된 파일 (prompt가 있는 파일)을 모두 조회
    // is_temp 여부와 관계없이 모든 AI 생성 파일 포함
    // 관계 정보 포함: 웹툰/에피소드/컷, 공정
    // created_by는 *에 포함되지만 명시적으로 확인
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
        source_file_id,
        created_by,
        metadata,
        cut:cuts (
          id,
          cut_number,
          title,
          episode:episodes (
            id,
            episode_number,
            title,
            webtoon:webtoons (
              id,
              title
            )
          )
        ),
        process:processes (
          id,
          name,
          color
        )
      `)
      .not('prompt', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 필터링 옵션
    if (sourceFileId) {
      query = query.eq('source_file_id', sourceFileId);
    }

    if (userId) {
      query = query.eq('created_by', userId);
    }

    // before 파라미터가 있으면 해당 시간 이전의 이미지만 조회 (하위 호환성)
    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: files, error: dbError } = await query;

    if (dbError) {
      console.error('[이미지 재생성 히스토리] DB 조회 실패:', dbError);
      return NextResponse.json(
        { error: 'AI 생성 파일 목록을 조회할 수 없습니다.' },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      console.log('[이미지 재생성 히스토리] AI 생성 파일 없음');
      return NextResponse.json({
        history: [],
        total: 0,
      });
    }

    // 디버깅: 첫 번째 파일의 created_by 확인
    if (files.length > 0) {
      console.log('[이미지 재생성 히스토리] 첫 번째 파일 created_by 확인:', {
        fileId: files[0].id,
        createdBy: files[0].created_by,
        hasCreatedBy: 'created_by' in files[0],
        fileKeys: Object.keys(files[0]).slice(0, 10),
      });
    }

    // 원본 파일 정보 별도 조회 (자기 참조 관계는 Supabase에서 직접 조회가 어려움)
    const sourceFileIds = files
      .map(f => f.source_file_id)
      .filter((id): id is string => id !== null && id !== undefined);
    
    let sourceFilesMap = new Map();
    if (sourceFileIds.length > 0) {
      const { data: sourceFiles, error: sourceFilesError } = await supabase
        .from('files')
        .select('id, file_name, file_path, storage_path, prompt, description, metadata')
        .in('id', sourceFileIds);
      
      if (!sourceFilesError && sourceFiles) {
        sourceFilesMap = new Map(sourceFiles.map(sf => [sf.id, sf]));
      }
    }

    // 생성자 정보 별도 조회
    const creatorIds = files
      .map(f => f.created_by)
      .filter((id): id is string => id !== null && id !== undefined);
    
    let creatorsMap = new Map();
    if (creatorIds.length > 0) {
      const { data: creators, error: creatorsError } = await supabase
        .from('user_profiles')
        .select('id, email, name')
        .in('id', creatorIds);
      
      if (creatorsError) {
        console.error('[이미지 재생성 히스토리] 생성자 정보 조회 실패:', creatorsError);
      }
      
      if (!creatorsError && creators) {
        creatorsMap = new Map(creators.map(c => [c.id, c]));
        console.log('[이미지 재생성 히스토리] 생성자 정보 조회 완료:', {
          creatorIdsCount: creatorIds.length,
          creatorIds: creatorIds.slice(0, 5), // 처음 5개만 로그
          creatorsCount: creators.length,
          creatorsMapSize: creatorsMap.size,
          creators: creators.slice(0, 3).map(c => ({ id: c.id, name: c.name })), // 처음 3개만 로그
        });
      } else {
        console.log('[이미지 재생성 히스토리] 생성자 정보 조회 실패 또는 없음:', {
          creatorIdsCount: creatorIds.length,
          creatorIds: creatorIds.slice(0, 5),
          creatorsError: creatorsError?.message,
        });
      }
    }

    // 응답 형식 변환
    const historyItems = files.map(file => {
      // source_file_id로 원본 파일 정보 조회
      const sourceFile = file.source_file_id ? sourceFilesMap.get(file.source_file_id) : null;
      
      // 생성자 정보 조회
      const creatorData = file.created_by ? creatorsMap.get(file.created_by) : null;
      if (file.created_by && !creatorData && creatorsMap.size > 0) {
        console.log('[이미지 재생성 히스토리] 생성자 정보 매칭 실패:', {
          fileId: file.id,
          createdBy: file.created_by,
          creatorsMapKeys: Array.from(creatorsMap.keys()).slice(0, 5),
        });
      }
      const creator = creatorData ? {
        id: creatorData.id,
        name: creatorData.name || '',
        email: creatorData.email || '',
      } : undefined;
      
      // cut이 배열인지 확인
      const cutData = Array.isArray(file.cut) ? file.cut[0] : file.cut;
      // episode가 배열인지 확인
      const episodeData = cutData?.episode 
        ? (Array.isArray(cutData.episode) ? cutData.episode[0] : cutData.episode)
        : null;
      // webtoon이 배열인지 확인
      const webtoonData = episodeData?.webtoon
        ? (Array.isArray(episodeData.webtoon) ? episodeData.webtoon[0] : episodeData.webtoon)
        : null;
      
      return {
        fileId: file.id,
        filePath: file.storage_path,
        fileUrl: file.file_path,
        createdAt: file.created_at,
        mimeType: file.mime_type || 'image/png',
        prompt: file.prompt || '',
        description: file.description || '',
        sourceFileId: file.source_file_id,
        metadata: file.metadata || {},
        sourceFile: sourceFile ? {
          id: sourceFile.id,
          filePath: sourceFile.storage_path,
          fileUrl: sourceFile.file_path,
          fileName: sourceFile.file_name,
          prompt: sourceFile.prompt || null,
          description: sourceFile.description || '',
          metadata: sourceFile.metadata || {},
        } : undefined,
        creator,
        webtoon: webtoonData ? {
          id: webtoonData.id,
          title: webtoonData.title,
        } : undefined,
        episode: episodeData ? {
          id: episodeData.id,
          episodeNumber: episodeData.episode_number,
          title: episodeData.title,
        } : undefined,
        cut: cutData ? {
          id: cutData.id,
          cutNumber: cutData.cut_number,
          title: cutData.title || '',
        } : undefined,
        process: file.process ? {
          id: Array.isArray(file.process) 
            ? file.process[0]?.id 
            : file.process.id,
          name: Array.isArray(file.process) 
            ? file.process[0]?.name 
            : file.process.name,
          color: Array.isArray(file.process) 
            ? file.process[0]?.color 
            : file.process.color,
        } : undefined,
      };
    });

    const totalTime = Date.now() - startTime;
    console.log('[이미지 재생성 히스토리] 히스토리 조회 완료:', {
      totalItems: historyItems.length,
      totalCount: totalCount || 0,
      offset,
      limit,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({
      history: historyItems,
      total: totalCount || 0,
      offset,
      limit,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 재생성 히스토리] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '히스토리 조회 중 오류가 발생했습니다.';
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

