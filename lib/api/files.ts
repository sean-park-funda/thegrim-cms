import { supabase, File, FileWithRelations } from '../supabase';

// 파일 목록 조회 (컷 기준)
export async function getFilesByCut(cutId: string): Promise<File[]> {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('cut_id', cutId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 파일 목록 조회 (공정 기준)
export async function getFilesByProcess(processId: string): Promise<FileWithRelations[]> {
  const { data, error } = await supabase
    .from('files')
    .select(`
      *,
      cut:cuts (
        *,
        episode:episodes (
          *,
          webtoon:webtoons (*)
        )
      ),
      process:processes (*)
    `)
    .eq('process_id', processId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 공정별 파일 개수 조회
export async function getFileCountByProcess(processId: string): Promise<number> {
  const { count, error } = await supabase
    .from('files')
    .select('*', { count: 'exact', head: true })
    .eq('process_id', processId);

  if (error) throw error;
  return count || 0;
}

// 검색어를 여러 형태로 확장하는 헬퍼 함수
// 한국어 동사/형용사의 다양한 어미 형태를 생성
function expandSearchQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queries = [trimmed]; // 원본 검색어 포함

  // 한국어 어미 패턴 (일반적인 경우)
  const endings = ['는', '은', '을', '를', '이', '가', '다', '음', '람', '람이', '라', '라는', '라서', '라도', 'ㅁ'];

  // 검색어가 어미로 끝나는 경우, 어미를 제거한 어간 생성
  for (const ending of endings) {
    if (trimmed.endsWith(ending) && trimmed.length > ending.length) {
      const stem = trimmed.slice(0, -ending.length);
      if (stem.length >= 2) {
        // 어간에 다른 어미들을 붙여서 검색어 확장
        queries.push(stem);
        queries.push(stem + '는');
        queries.push(stem + '은');
        queries.push(stem + '을');
        queries.push(stem + '를');
        queries.push(stem + '이');
        queries.push(stem + '가');
        queries.push(stem + '다');
        queries.push(stem + '음');
        queries.push(stem + '람');
        queries.push(stem + '라');
        queries.push(stem + '라는');
      }
    }
  }

  // 특수 케이스: "놀람" -> "놀라" 추출
  // "람"으로 끝나는 경우, "라" + "ㅁ" 받침으로 분석
  if (trimmed.endsWith('람') && trimmed.length > 1) {
    const stemWithoutM = trimmed.slice(0, -1); // "놀람" -> "놀라"
    if (stemWithoutM.length >= 2) {
      queries.push(stemWithoutM); // "놀라"
      queries.push(stemWithoutM + '는');
      queries.push(stemWithoutM + '은');
      queries.push(stemWithoutM + '을');
      queries.push(stemWithoutM + '를');
      queries.push(stemWithoutM + '이');
      queries.push(stemWithoutM + '가');
      queries.push(stemWithoutM + '다');
      queries.push(stemWithoutM + '음');
      queries.push(stemWithoutM + '라');
      queries.push(stemWithoutM + '라는');
    }
  }

  // 중복 제거
  return Array.from(new Set(queries));
}

// 파일 검색 (description 및 file_name 기반, Full-Text Search 사용)
export async function searchFiles(query: string): Promise<FileWithRelations[]> {
  try {
    // 검색어가 비어있으면 빈 배열 반환
    if (!query || query.trim().length === 0) {
      return [];
    }

    const trimmedQuery = query.trim();
    
    // 검색어를 여러 형태로 확장
    const expandedQueries = expandSearchQuery(trimmedQuery);
    
    // 모든 확장된 검색어로 검색 수행
    const allFileIds = new Set<string>();

    for (const searchTerm of expandedQueries) {
      try {
        const { data: searchResults, error: rpcError } = await supabase
          .rpc('search_files_fulltext', { search_query: searchTerm });

        if (rpcError) {
          console.warn(`검색어 "${searchTerm}" 검색 중 오류:`, rpcError);
          continue; // 하나의 검색어 실패해도 다른 검색어는 계속 시도
        }

        if (searchResults && searchResults.length > 0) {
          searchResults.forEach((file: File) => {
            allFileIds.add(file.id);
          });
        }
      } catch (err) {
        console.warn(`검색어 "${searchTerm}" 검색 중 예외:`, err);
        continue;
      }
    }

    // 검색 결과가 없으면 빈 배열 반환
    if (allFileIds.size === 0) {
      return [];
    }

    // 검색된 파일 ID 배열 추출
    const fileIds = Array.from(allFileIds);

    // 파일 ID를 사용하여 관계 데이터를 포함한 전체 파일 정보 조회
    const { data, error } = await supabase
      .from('files')
      .select(`
        *,
        cut:cuts (
          *,
          episode:episodes (
            *,
            webtoon:webtoons (*)
          )
        ),
        process:processes (*)
      `)
      .in('id', fileIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('검색 쿼리 오류:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('파일 검색 실패:', {
      query,
      error: error?.message || error,
      details: error?.details,
      code: error?.code,
      stack: error?.stack
    });
    throw error;
  }
}

// 파일 생성
export async function createFile(file: Omit<File, 'id' | 'created_at' | 'updated_at'>): Promise<File> {
  const { data, error } = await supabase
    .from('files')
    .insert(file)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 파일 업데이트
export async function updateFile(id: string, updates: Partial<File>): Promise<File> {
  const { data, error } = await supabase
    .from('files')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 파일 삭제
export async function deleteFile(id: string): Promise<void> {
  // 먼저 파일 정보를 가져옴
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  // Storage에서 파일 삭제
  if (file.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('webtoon-files')
      .remove([file.storage_path]);

    if (storageError) console.error('Storage deletion error:', storageError);
  }

  // DB에서 파일 정보 삭제
  const { error } = await supabase
    .from('files')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// 파일명을 URL-safe하게 변환 (Supabase Storage 경로용)
function sanitizeFileName(fileName: string): string {
  // 확장자 추출
  const lastDotIndex = fileName.lastIndexOf('.');
  const name = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';

  // 파일명을 안전한 형식으로 변환
  // 한글, 특수문자를 제거하고 영문, 숫자, _, - 만 허용
  const sanitizedName = name
    .replace(/[^a-zA-Z0-9_-]/g, '_') // 영문, 숫자, _, - 외의 문자를 _로 변환
    .replace(/_+/g, '_') // 연속된 _를 하나로
    .replace(/^_|_$/g, '') // 앞뒤 _ 제거
    .substring(0, 100) || 'file'; // 길이 제한, 빈 문자열이면 'file' 사용

  return `${sanitizedName}${extension}`;
}

// 이미지 URL이 접근 가능한지 확인하는 헬퍼 함수
async function waitForImageUrl(imageUrl: string, maxRetries = 5, delayMs = 1000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (response.ok) {
        return; // 이미지가 접근 가능함
      }
    } catch (error) {
      // 에러 무시하고 재시도
    }
    
    if (i < maxRetries - 1) {
      // 마지막 시도가 아니면 대기
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // 모든 재시도 실패 시에도 계속 진행 (이미지가 실제로는 접근 가능할 수 있음)
}

// 이미지 분석 및 메타데이터 업데이트
export async function analyzeImage(fileId: string, retryCount = 0): Promise<File> {
  console.log(`[클라이언트] 이미지 분석 시작 (fileId: ${fileId}, retryCount: ${retryCount})`);
  
  // 파일 정보 가져오기
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (fetchError) {
    console.error('[클라이언트] 파일 조회 실패:', fetchError);
    throw fetchError;
  }
  
  if (!file) {
    console.error('[클라이언트] 파일을 찾을 수 없음:', fileId);
    throw new Error('파일을 찾을 수 없습니다.');
  }

  console.log('[클라이언트] 파일 정보:', {
    fileId: file.id,
    fileName: file.file_name,
    fileType: file.file_type,
    filePath: file.file_path,
    storagePath: file.storage_path
  });

  // 이미지 파일인지 확인
  if (file.file_type !== 'image') {
    console.error('[클라이언트] 이미지 파일이 아님:', file.file_type);
    throw new Error('이미지 파일만 분석할 수 있습니다.');
  }

  // 이미지 URL이 접근 가능할 때까지 대기 (최대 5초)
  console.log('[클라이언트] 이미지 URL 접근 가능 여부 확인 시작...');
  await waitForImageUrl(file.file_path, 5, 1000);
  console.log('[클라이언트] 이미지 URL 접근 가능 확인 완료');

  // 분석 API 호출
  console.log('[클라이언트] 분석 API 호출 시작...');
  const apiStartTime = Date.now();
  
  const response = await fetch('/api/analyze-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageUrl: file.file_path,
    }),
  });

  const apiTime = Date.now() - apiStartTime;
  console.log('[클라이언트] 분석 API 응답:', {
    status: response.status,
    statusText: response.statusText,
    apiTime: `${apiTime}ms`
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[클라이언트] 분석 API 실패:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      retryCount
    });
    
    // 400 에러이고 "이미지를 가져올 수 없습니다"인 경우 재시도
    if (response.status === 400 && errorData.error === '이미지를 가져올 수 없습니다.' && retryCount < 3) {
      console.log(`[클라이언트] 재시도 예정 (${retryCount + 1}/3)...`);
      // 2초 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, 2000));
      return analyzeImage(fileId, retryCount + 1);
    }
    
    const errorMessage = errorData.error || '이미지 분석에 실패했습니다.';
    const errorDetails = errorData.details ? `\n상세 정보: ${JSON.stringify(errorData.details, null, 2)}` : '';
    throw new Error(`${errorMessage}${errorDetails}`);
  }

  const analysisResult = await response.json();
  console.log('[클라이언트] 분석 결과 수신:', {
    hasSceneSummary: !!analysisResult.scene_summary,
    tagsCount: analysisResult.tags?.length,
    charactersCount: analysisResult.characters_count
  });

  // 메타데이터 업데이트
  const updatedMetadata = {
    ...file.metadata,
    scene_summary: analysisResult.scene_summary,
    tags: analysisResult.tags,
    characters_count: analysisResult.characters_count,
    analyzed_at: new Date().toISOString(),
  };

  console.log('[클라이언트] 메타데이터 업데이트 시작...');
  const updatedFile = await updateFile(fileId, {
    metadata: updatedMetadata,
  });
  console.log('[클라이언트] 이미지 분석 완료');

  return updatedFile;
}

// 파일 업로드
export async function uploadFile(
  file: globalThis.File,
  cutId: string,
  processId: string,
  description?: string
): Promise<File> {
  const timestamp = Date.now();
  const sanitizedFileName = sanitizeFileName(file.name);
  const fileName = `${timestamp}-${sanitizedFileName}`;
  const storagePath = `${cutId}/${processId}/${fileName}`;

  // Storage에 파일 업로드
  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  // 공개 URL 생성
  const { data: publicUrlData } = supabase.storage
    .from('webtoon-files')
    .getPublicUrl(storagePath);

  // DB에 파일 정보 저장
  const createdFile = await createFile({
    cut_id: cutId,
    process_id: processId,
    file_name: file.name,
    file_path: publicUrlData.publicUrl,
    storage_path: storagePath,
    file_size: file.size,
    file_type: file.type.split('/')[0],
    mime_type: file.type,
    description: description || '',
    metadata: {}
  });

  // 이미지 파일인 경우 자동 분석 (비동기 처리)
  if (createdFile.file_type === 'image') {
    analyzeImage(createdFile.id).catch((error) => {
      console.error('이미지 자동 분석 실패:', error);
      // 분석 실패해도 파일 업로드는 성공 처리
    });
  }

  return createdFile;
}


