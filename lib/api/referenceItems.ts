export interface ReferenceItem {
  id: string;
  webtoon_id: string;
  type: 'outfit' | 'prop';
  name: string;
  description?: string | null;
  tags: string[];
  file_path: string;
  storage_path: string;
  file_size?: number | null;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

// 목록 조회
export async function getReferenceItems(
  webtoonId: string,
  type?: 'outfit' | 'prop'
): Promise<ReferenceItem[]> {
  const url = `/api/webtoons/${webtoonId}/reference-items${type ? `?type=${type}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('레퍼런스 아이템 조회 실패');
  return res.json();
}

// 업로드 (File 객체)
export async function uploadReferenceItem(
  webtoonId: string,
  file: File,
  type: 'outfit' | 'prop',
  name: string,
  options?: { description?: string; tags?: string[]; parentId?: string }
): Promise<ReferenceItem> {
  const base64 = await fileToBase64(file);
  const res = await fetch(`/api/webtoons/${webtoonId}/reference-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageData: base64,
      mimeType: file.type || 'image/png',
      type,
      name,
      ...options,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '업로드 실패');
  }
  return res.json();
}

// 삭제
export async function deleteReferenceItem(webtoonId: string, itemId: string): Promise<void> {
  const res = await fetch(`/api/webtoons/${webtoonId}/reference-items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('삭제 실패');
}

// 이름/설명 수정
export async function updateReferenceItem(
  webtoonId: string,
  itemId: string,
  data: { name?: string; description?: string; tags?: string[] }
): Promise<ReferenceItem> {
  const res = await fetch(`/api/webtoons/${webtoonId}/reference-items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('수정 실패');
  return res.json();
}

// 수정본 생성 (동기 — 완성된 ReferenceItem 반환)
export async function modifyReferenceItem(
  webtoonId: string,
  itemId: string,
  instruction: string,
  newName?: string
): Promise<ReferenceItem> {
  const res = await fetch(`/api/webtoons/${webtoonId}/reference-items/${itemId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction, newName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '수정 요청 실패');
  }
  return res.json();
}

// 여러 레퍼런스로 새 요소 생성
export async function createReferenceItemFromRefs(
  webtoonId: string,
  referenceItemIds: string[],
  instruction: string,
  name: string,
  type: 'outfit' | 'prop',
  tags?: string[]
): Promise<ReferenceItem> {
  const res = await fetch(`/api/webtoons/${webtoonId}/reference-items/create-from-refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenceItemIds, instruction, name, type, tags }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '생성 요청 실패');
  }
  return res.json();
}

// 헬퍼: File → base64 (data URL prefix 제거)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
