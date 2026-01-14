-- ========================================
-- 자유창작 기능 데이터베이스 스키마
-- ========================================

-- 1. 자유창작 세션 테이블
-- 사용자가 웹툰별로 여러 세션을 가질 수 있음
CREATE TABLE IF NOT EXISTS free_creation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT '새 세션',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 자유창작 메시지 테이블 (채팅 히스토리)
-- 각 메시지는 프롬프트, 사용된 레퍼런스, 생성된 이미지를 포함
CREATE TABLE IF NOT EXISTS free_creation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES free_creation_sessions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  reference_file_ids UUID[] DEFAULT '{}',
  generated_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  api_provider VARCHAR(20) DEFAULT 'gemini',
  aspect_ratio VARCHAR(20) DEFAULT '1:1',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 자유창작 최근 레퍼런스 테이블
-- 세션별로 최근 사용한 레퍼런스 이미지 추적
CREATE TABLE IF NOT EXISTS free_creation_recent_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES free_creation_sessions(id) ON DELETE CASCADE,
  reference_file_id UUID NOT NULL REFERENCES reference_files(id) ON DELETE CASCADE,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, reference_file_id)
);

-- ========================================
-- 인덱스 생성
-- ========================================

CREATE INDEX IF NOT EXISTS idx_free_creation_sessions_webtoon_id ON free_creation_sessions(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_free_creation_sessions_user_id ON free_creation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_free_creation_sessions_created_at ON free_creation_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_free_creation_messages_session_id ON free_creation_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_free_creation_messages_created_at ON free_creation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_free_creation_messages_status ON free_creation_messages(status);

CREATE INDEX IF NOT EXISTS idx_free_creation_recent_refs_session ON free_creation_recent_references(session_id);
CREATE INDEX IF NOT EXISTS idx_free_creation_recent_refs_used_at ON free_creation_recent_references(used_at DESC);

-- ========================================
-- 업데이트 트리거 적용
-- ========================================

CREATE TRIGGER update_free_creation_sessions_updated_at BEFORE UPDATE ON free_creation_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- files 테이블 cut_id, process_id NULL 허용 (자유창작용)
-- ========================================

-- cut_id NULL 허용 (자유창작은 특정 컷에 속하지 않음)
ALTER TABLE files ALTER COLUMN cut_id DROP NOT NULL;

-- process_id NULL 허용 (자유창작은 특정 공정에 속하지 않음)
ALTER TABLE files ALTER COLUMN process_id DROP NOT NULL;

-- ========================================
-- RLS 정책 (Row Level Security)
-- ========================================

-- 자유창작 세션: 본인 세션만 접근 가능
ALTER TABLE free_creation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON free_creation_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON free_creation_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON free_creation_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON free_creation_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- 자유창작 메시지: 본인 세션의 메시지만 접근 가능
ALTER TABLE free_creation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session messages" ON free_creation_messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own session messages" ON free_creation_messages
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own session messages" ON free_creation_messages
  FOR UPDATE USING (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own session messages" ON free_creation_messages
  FOR DELETE USING (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );

-- 자유창작 최근 레퍼런스: 본인 세션의 레퍼런스만 접근 가능
ALTER TABLE free_creation_recent_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session references" ON free_creation_recent_references
  FOR SELECT USING (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own session references" ON free_creation_recent_references
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own session references" ON free_creation_recent_references
  FOR DELETE USING (
    session_id IN (SELECT id FROM free_creation_sessions WHERE user_id = auth.uid())
  );
