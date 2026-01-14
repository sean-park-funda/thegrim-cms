import { supabase, ReferenceFile, ReferenceFileWithProcess } from '../supabase';

// 레퍼런스 파일 목록 조회 (웹툰 기준)
export async function getReferenceFilesByWebtoon(webtoonId: string): Promise<ReferenceFileWithProcess[]> {
    const { data, error } = await supabase
        .from('reference_files')
        .select(`
      *,
      process:processes (*)
    `)
        .eq('webtoon_id', webtoonId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

// 레퍼런스 파일 목록 조회 (웹툰 + 공정 기준)
export async function getReferenceFilesByProcess(
    webtoonId: string,
    processId: string
): Promise<ReferenceFileWithProcess[]> {
    const { data, error } = await supabase
        .from('reference_files')
        .select(`
      *,
      process:processes (*)
    `)
        .eq('webtoon_id', webtoonId)
        .eq('process_id', processId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

// 레퍼런스 파일 생성
export async function createReferenceFile(
    file: Omit<ReferenceFile, 'id' | 'created_at' | 'updated_at'>
): Promise<ReferenceFile> {
    const { data, error } = await supabase
        .from('reference_files')
        .insert(file)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// 레퍼런스 파일 업데이트
export async function updateReferenceFile(
    id: string,
    updates: Partial<ReferenceFile>
): Promise<ReferenceFile> {
    const { data, error } = await supabase
        .from('reference_files')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// 레퍼런스 파일 삭제
export async function deleteReferenceFile(id: string): Promise<void> {
    // 먼저 파일 정보를 가져옴
    const { data: file, error: fetchError } = await supabase
        .from('reference_files')
        .select('storage_path, thumbnail_path')
        .eq('id', id)
        .single();

    if (fetchError) {
        console.error('레퍼런스 파일 조회 실패:', fetchError);
        throw new Error('레퍼런스 파일을 찾을 수 없습니다.');
    }

    if (!file) {
        throw new Error('레퍼런스 파일을 찾을 수 없습니다.');
    }

    // Storage에서 파일 삭제
    const filesToDelete = [file.storage_path];
    if (file.thumbnail_path) {
        filesToDelete.push(file.thumbnail_path);
    }

    if (filesToDelete.length > 0) {
        const { error: storageError } = await supabase.storage
            .from('webtoon-files')
            .remove(filesToDelete);

        if (storageError) {
            console.error('Storage 삭제 실패:', storageError);
            // Storage 삭제 실패해도 DB 삭제는 진행
        }
    }

    // DB에서 파일 정보 삭제
    const { error: dbError } = await supabase
        .from('reference_files')
        .delete()
        .eq('id', id);

    if (dbError) {
        console.error('DB 삭제 실패:', dbError);
        throw new Error('레퍼런스 파일 삭제에 실패했습니다.');
    }
}

// 파일명을 URL-safe하게 변환 (Supabase Storage 경로용)
function sanitizeFileName(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    const name = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';

    const sanitizedName = name
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 100) || 'file';

    return `${sanitizedName}${extension}`;
}

// 레퍼런스 파일 업로드
export async function uploadReferenceFile(
    file: globalThis.File,
    webtoonId: string,
    processId: string,
    description?: string,
    createdBy?: string
): Promise<ReferenceFile> {
    const timestamp = Date.now();
    const sanitizedFileName = sanitizeFileName(file.name);
    const fileName = `${timestamp}-${sanitizedFileName}`;
    const storagePath = `references/${webtoonId}/${processId}/${fileName}`;

    // Storage에 파일 업로드
    const { error: uploadError } = await supabase.storage
        .from('webtoon-files')
        .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // 공개 URL 생성
    const { data: publicUrlData } = supabase.storage
        .from('webtoon-files')
        .getPublicUrl(storagePath);

    const fileType = file.type.split('/')[0];

    // DB에 파일 정보 저장
    const createdFile = await createReferenceFile({
        webtoon_id: webtoonId,
        process_id: processId,
        file_name: file.name,
        file_path: publicUrlData.publicUrl,
        storage_path: storagePath,
        file_size: file.size,
        file_type: fileType,
        mime_type: file.type,
        description: description || '',
        metadata: {},
        created_by: createdBy || null,
    });

    // 이미지 파일인 경우 썸네일 생성 (비동기, 실패해도 업로드는 성공으로 처리)
    if (fileType === 'image') {
        generateReferenceThumbnail(createdFile.id).catch((error) => {
            console.error('레퍼런스 파일 썸네일 생성 실패:', error);
            // 썸네일 생성 실패는 무시 (나중에 수동 생성 가능)
        });
    }

    return createdFile;
}

// 레퍼런스 파일 썸네일 생성
export async function generateReferenceThumbnail(fileId: string): Promise<string> {
    const response = await fetch('/api/generate-reference-thumbnail', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            fileId,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || '썸네일 생성에 실패했습니다.';
        throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.thumbnailUrl;
}

// 썸네일 URL 가져오기
export async function getReferenceFileThumbnailUrl(file: ReferenceFile): Promise<string> {
    // 썸네일이 이미 있으면 반환
    if (file.thumbnail_path) {
        const { data: thumbnailUrlData } = supabase.storage
            .from('webtoon-files')
            .getPublicUrl(file.thumbnail_path);
        return thumbnailUrlData.publicUrl;
    }

    // 이미지 파일이 아니면 원본 URL 반환
    if (file.file_type !== 'image') {
        return file.file_path;
    }

    // 썸네일이 없으면 원본 URL 반환
    return file.file_path;
}
