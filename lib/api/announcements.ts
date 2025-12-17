import { supabase } from '../supabase';

// 콘텐츠 블록 타입 정의
export type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string };

// 공지사항 타입 정의
export interface Announcement {
  id: string;
  title: string;
  content: ContentBlock[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    name: string | null;
    email: string;
  };
}

// 공지사항 생성 입력 타입
export interface CreateAnnouncementInput {
  title: string;
  content: ContentBlock[];
  created_by: string;
}

// 공지사항 수정 입력 타입
export interface UpdateAnnouncementInput {
  title?: string;
  content?: ContentBlock[];
  is_active?: boolean;
}

// 모든 공지사항 조회 (관리자용)
export async function getAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      creator:user_profiles!created_by(name, email)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('공지사항 조회 오류:', error);
    throw error;
  }

  return data || [];
}

// 활성화된 공지사항만 조회
export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      creator:user_profiles!created_by(name, email)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('활성 공지사항 조회 오류:', error);
    throw error;
  }

  return data || [];
}

// 읽지 않은 공지사항 조회 (사용자용)
export async function getUnreadAnnouncements(userId: string): Promise<Announcement[]> {
  // 활성화된 공지사항 중 사용자가 읽지 않은 것들만 조회
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      creator:user_profiles!created_by(name, email)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: true }); // 오래된 것부터 표시

  if (error) {
    console.error('공지사항 조회 오류:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // 사용자가 읽은 공지사항 ID 목록 조회
  const { data: readData, error: readError } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', userId);

  if (readError) {
    console.error('읽음 상태 조회 오류:', readError);
    throw readError;
  }

  const readAnnouncementIds = new Set((readData || []).map(r => r.announcement_id));

  // 읽지 않은 공지사항만 필터링
  return data.filter(announcement => !readAnnouncementIds.has(announcement.id));
}

// 공지사항 생성
export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: input.title,
      content: input.content,
      created_by: input.created_by,
    })
    .select(`
      *,
      creator:user_profiles!created_by(name, email)
    `)
    .single();

  if (error) {
    console.error('공지사항 생성 오류:', error);
    throw error;
  }

  return data;
}

// 공지사항 수정
export async function updateAnnouncement(id: string, input: UpdateAnnouncementInput): Promise<Announcement> {
  const { data, error } = await supabase
    .from('announcements')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      creator:user_profiles!created_by(name, email)
    `)
    .single();

  if (error) {
    console.error('공지사항 수정 오류:', error);
    throw error;
  }

  return data;
}

// 공지사항 삭제 (soft delete - is_active를 false로 설정)
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('공지사항 삭제 오류:', error);
    throw error;
  }
}

// 공지사항 완전 삭제 (hard delete)
export async function permanentlyDeleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('공지사항 완전 삭제 오류:', error);
    throw error;
  }
}

// 공지사항 읽음 처리
export async function markAnnouncementAsRead(userId: string, announcementId: string): Promise<void> {
  const { error } = await supabase
    .from('announcement_reads')
    .upsert(
      {
        user_id: userId,
        announcement_id: announcementId,
        read_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,announcement_id',
      }
    );

  if (error) {
    console.error('읽음 처리 오류:', error);
    throw error;
  }
}

// 단일 공지사항 조회
export async function getAnnouncementById(id: string): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      creator:user_profiles!created_by(name, email)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('공지사항 조회 오류:', error);
    throw error;
  }

  return data;
}
