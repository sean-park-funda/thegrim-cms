import {
  FreeCreationSession,
  FreeCreationSessionWithStats,
  FreeCreationMessage,
  FreeCreationMessageWithFile,
  FreeCreationRecentReferenceWithFile,
  ApiProvider,
  ReferenceFile,
} from '../supabase';

// 세션 목록 조회
export async function getFreeCreationSessions(
  webtoonId: string,
  userId?: string,
  includeStats?: boolean
): Promise<FreeCreationSessionWithStats[]> {
  const params = new URLSearchParams({
    webtoonId,
    ...(userId && { userId }),
    ...(includeStats && { includeStats: 'true' }),
  });

  const response = await fetch(
    `/api/free-creation/sessions?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '세션 목록 조회에 실패했습니다.');
  }

  const data = await response.json();
  return data.sessions;
}

// 세션 생성
export async function createFreeCreationSession(
  webtoonId: string,
  userId: string,
  title?: string
): Promise<FreeCreationSession> {
  const response = await fetch('/api/free-creation/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webtoonId, userId, title }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '세션 생성에 실패했습니다.');
  }

  const data = await response.json();
  return data.session;
}

// 세션 조회
export async function getFreeCreationSession(
  sessionId: string
): Promise<FreeCreationSession> {
  const response = await fetch(`/api/free-creation/sessions/${sessionId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '세션 조회에 실패했습니다.');
  }

  const data = await response.json();
  return data.session;
}

// 세션 수정
export async function updateFreeCreationSession(
  sessionId: string,
  title: string
): Promise<FreeCreationSession> {
  const response = await fetch(`/api/free-creation/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '세션 수정에 실패했습니다.');
  }

  const data = await response.json();
  return data.session;
}

// 세션 삭제
export async function deleteFreeCreationSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/free-creation/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '세션 삭제에 실패했습니다.');
  }
}

// 메시지 목록 조회
export async function getFreeCreationMessages(
  sessionId: string
): Promise<FreeCreationMessageWithFile[]> {
  const response = await fetch(
    `/api/free-creation/sessions/${sessionId}/messages`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '메시지 목록 조회에 실패했습니다.');
  }

  const data = await response.json();
  return data.messages;
}

// 메시지 생성 (이미지 생성 포함)
export interface CreateMessageOptions {
  prompt: string;
  referenceFileIds?: string[];
  apiProvider?: ApiProvider;
  aspectRatio?: string;
  userId?: string;
  webtoonId?: string;
}

export async function createFreeCreationMessage(
  sessionId: string,
  options: CreateMessageOptions
): Promise<FreeCreationMessageWithFile> {
  const response = await fetch(
    `/api/free-creation/sessions/${sessionId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '메시지 생성에 실패했습니다.');
  }

  const data = await response.json();
  return data.message;
}

// 최근 레퍼런스 조회
export async function getFreeCreationRecentReferences(
  sessionId: string,
  limit?: number
): Promise<FreeCreationRecentReferenceWithFile[]> {
  const url = limit
    ? `/api/free-creation/sessions/${sessionId}/recent-references?limit=${limit}`
    : `/api/free-creation/sessions/${sessionId}/recent-references`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '최근 레퍼런스 조회에 실패했습니다.');
  }

  const data = await response.json();
  return data.recentReferences;
}

// 세션이 없으면 생성하고, 있으면 가장 최근 세션 반환
export async function getOrCreateFreeCreationSession(
  webtoonId: string,
  userId: string
): Promise<FreeCreationSession> {
  const sessions = await getFreeCreationSessions(webtoonId, userId);

  if (sessions.length > 0) {
    return sessions[0]; // 가장 최근 세션
  }

  // 새 세션 생성
  return createFreeCreationSession(webtoonId, userId);
}
