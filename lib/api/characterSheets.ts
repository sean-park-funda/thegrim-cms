import { supabase, CharacterSheet } from '@/lib/supabase';

/**
 * 캐릭터의 시트 목록 조회
 */
export async function getSheetsByCharacter(characterId: string): Promise<CharacterSheet[]> {
  const { data, error } = await supabase
    .from('character_sheets')
    .select('*')
    .eq('character_id', characterId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('캐릭터 시트 목록 조회 실패:', error);
    throw error;
  }

  return data || [];
}

/**
 * 캐릭터 시트 상세 조회
 */
export async function getCharacterSheet(sheetId: string): Promise<CharacterSheet | null> {
  const { data, error } = await supabase
    .from('character_sheets')
    .select('*')
    .eq('id', sheetId)
    .single();

  if (error) {
    console.error('캐릭터 시트 상세 조회 실패:', error);
    throw error;
  }

  return data;
}

/**
 * 캐릭터 시트 업로드
 */
export async function uploadCharacterSheet(
  file: File,
  characterId: string,
  description?: string
): Promise<CharacterSheet> {
  // 파일명 생성 (고유하게, 한글 제거)
  const fileExt = file.name.split('.').pop();
  const uniqueId = crypto.randomUUID();
  const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '') || 'sheet';
  const fileName = `${baseName}-${uniqueId}.${fileExt}`;
  const storagePath = `characters/${characterId}/${fileName}`;

  console.log('[uploadCharacterSheet] 업로드 시작', {
    characterId,
    originalFileName: file.name,
    sanitizedFileName: fileName,
    storagePath,
    fileSize: file.size,
    fileType: file.type,
  });

  // Supabase Storage에 업로드
  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('[uploadCharacterSheet] 캐릭터 시트 파일 업로드 실패', {
      error: uploadError,
      characterId,
      storagePath,
    });
    throw uploadError;
  }

  // 공개 URL 가져오기
  const { data: { publicUrl } } = supabase.storage
    .from('webtoon-files')
    .getPublicUrl(storagePath);

  console.log('[uploadCharacterSheet] Storage 업로드 성공, DB 저장 시도', {
    characterId,
    storagePath,
    publicUrl,
  });

  // DB에 메타데이터 저장
  const { data: sheet, error: dbError } = await supabase
    .from('character_sheets')
    .insert([{
      character_id: characterId,
      file_name: file.name,
      file_path: publicUrl,
      storage_path: storagePath,
      file_size: file.size,
      description: description || null,
    }])
    .select()
    .single();

  if (dbError) {
    // DB 저장 실패 시 업로드된 파일 삭제
    await supabase.storage.from('webtoon-files').remove([storagePath]);
    console.error('[uploadCharacterSheet] 캐릭터 시트 DB 저장 실패', {
      error: dbError,
      characterId,
      storagePath,
      payload: {
        character_id: characterId,
        file_name: file.name,
        file_path: publicUrl,
        storage_path: storagePath,
        file_size: file.size,
        description: description || null,
      },
    });
    throw dbError;
  }

  console.log('[uploadCharacterSheet] 캐릭터 시트 업로드 및 DB 저장 성공', {
    characterId,
    sheetId: sheet.id,
  });

  return sheet;
}

/**
 * base64 이미지로 캐릭터 시트 저장
 */
export async function saveCharacterSheetFromBase64(
  imageData: string,
  mimeType: string,
  characterId: string,
  fileName: string,
  description?: string
): Promise<CharacterSheet> {
  // base64 to Blob
  const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
  const binaryData = Buffer.from(base64Data, 'base64');
  const blob = new Blob([binaryData], { type: mimeType });

  // 파일명 생성 (한글 제거 - Supabase Storage는 한글 파일명 지원 안함)
  const ext = mimeType.split('/')[1] || 'png';
  const uniqueId = crypto.randomUUID();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '') || 'character-sheet';
  const fullFileName = `${safeFileName}-${uniqueId}.${ext}`;
  const storagePath = `characters/${characterId}/${fullFileName}`;

  // Supabase Storage에 업로드
  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, blob, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('캐릭터 시트 파일 업로드 실패:', uploadError);
    throw uploadError;
  }

  // 공개 URL 가져오기
  const { data: { publicUrl } } = supabase.storage
    .from('webtoon-files')
    .getPublicUrl(storagePath);

  // DB에 메타데이터 저장
  const { data: sheet, error: dbError } = await supabase
    .from('character_sheets')
    .insert([{
      character_id: characterId,
      file_name: `${fileName}.${ext}`,
      file_path: publicUrl,
      storage_path: storagePath,
      file_size: binaryData.length,
      description: description || null,
    }])
    .select()
    .single();

  if (dbError) {
    // DB 저장 실패 시 업로드된 파일 삭제
    await supabase.storage.from('webtoon-files').remove([storagePath]);
    console.error('캐릭터 시트 DB 저장 실패:', dbError);
    throw dbError;
  }

  return sheet;
}

/**
 * 캐릭터 시트 수정 (설명만)
 */
export async function updateCharacterSheet(
  sheetId: string,
  data: { description?: string }
): Promise<CharacterSheet> {
  const { data: sheet, error } = await supabase
    .from('character_sheets')
    .update({
      ...(data.description !== undefined && { description: data.description || null }),
    })
    .eq('id', sheetId)
    .select()
    .single();

  if (error) {
    console.error('캐릭터 시트 수정 실패:', error);
    throw error;
  }

  return sheet;
}

/**
 * 캐릭터 시트 삭제
 */
export async function deleteCharacterSheet(sheetId: string): Promise<void> {
  // 시트 정보 조회
  const { data: sheet } = await supabase
    .from('character_sheets')
    .select('storage_path, thumbnail_path')
    .eq('id', sheetId)
    .single();

  if (sheet) {
    // Storage에서 파일 삭제
    const pathsToDelete: string[] = [];
    if (sheet.storage_path) pathsToDelete.push(sheet.storage_path);
    if (sheet.thumbnail_path) pathsToDelete.push(sheet.thumbnail_path);

    if (pathsToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('webtoon-files')
        .remove(pathsToDelete);

      if (storageError) {
        console.warn('캐릭터 시트 파일 삭제 실패:', storageError);
      }
    }
  }

  // DB에서 삭제
  const { error } = await supabase
    .from('character_sheets')
    .delete()
    .eq('id', sheetId);

  if (error) {
    console.error('캐릭터 시트 삭제 실패:', error);
    throw error;
  }
}

/**
 * 캐릭터 시트 썸네일 URL 가져오기
 */
export function getSheetThumbnailUrl(sheet: CharacterSheet): string {
  // 썸네일이 있으면 썸네일 URL 반환, 없으면 원본 이미지 URL 반환
  if (sheet.thumbnail_path) {
    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(sheet.thumbnail_path);
    return publicUrl;
  }
  return sheet.file_path;
}

