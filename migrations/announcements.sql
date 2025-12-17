-- ========================================
-- 공지사항 시스템 데이터베이스 스키마
-- ========================================

-- 1. 공지사항 테이블
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL DEFAULT '[]',  -- [{type: 'text', value: '...'}, {type: 'image', url: '...'}]
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 사용자별 공지사항 읽음 상태 추적 테이블
CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, announcement_id)
);

-- ========================================
-- 인덱스 생성
-- ========================================

CREATE INDEX IF NOT EXISTS idx_announcements_is_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON announcement_reads(announcement_id);

-- ========================================
-- 업데이트 트리거 적용
-- ========================================

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- RLS 정책 (개발용 - 프로덕션 전 수정 필요)
-- ========================================

-- ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

-- 공지사항: 모든 인증된 사용자가 읽기 가능, 관리자만 쓰기 가능
-- CREATE POLICY "announcements_read_policy" ON announcements FOR SELECT USING (true);
-- CREATE POLICY "announcements_write_policy" ON announcements FOR ALL USING (
--   EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
-- );

-- 읽음 상태: 본인의 읽음 상태만 읽기/쓰기 가능
-- CREATE POLICY "announcement_reads_policy" ON announcement_reads FOR ALL USING (user_id = auth.uid());
