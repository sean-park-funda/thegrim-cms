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

// 파일 검색 (description 기반)
export async function searchFiles(query: string): Promise<FileWithRelations[]> {
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
    .textSearch('description', query, {
      type: 'websearch',
      config: 'korean'
    })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
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
  return createFile({
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
}


