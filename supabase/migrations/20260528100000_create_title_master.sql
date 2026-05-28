-- 작품 마스터 정보 테이블
-- localStorage 의존성을 제거하고 서버 사이드에서 관리하기 위한 테이블
CREATE TABLE IF NOT EXISTS title_master (
  slug TEXT PRIMARY KEY,
  work_id UUID REFERENCES rs_works(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_url TEXT,
  team_label TEXT,
  status TEXT NOT NULL DEFAULT '준비중'
    CHECK (status IN ('연재중', '완결', '휴재', '준비중')),
  creators JSONB NOT NULL DEFAULT '[]'::jsonb,
  platform TEXT NOT NULL DEFAULT '',
  serial_type TEXT NOT NULL DEFAULT '기타'
    CHECK (serial_type IN ('요일웹툰', '매일+', '기타')),
  day_of_week TEXT
    CHECK (day_of_week IS NULL OR day_of_week IN ('월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일')),
  start_date DATE NOT NULL,
  end_date DATE,
  non_exclusive_date DATE,
  episode_count INT NOT NULL DEFAULT 0,
  age_rating TEXT NOT NULL DEFAULT '',
  main_genre TEXT NOT NULL DEFAULT '',
  sub_genre TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  element TEXT NOT NULL DEFAULT '',
  logline TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  global_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  secondary_biz JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  is_custom BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_title_master_status ON title_master(status);
CREATE INDEX idx_title_master_is_custom ON title_master(is_custom);
CREATE INDEX idx_title_master_platform ON title_master(platform);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_title_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_title_master_updated_at
  BEFORE UPDATE ON title_master
  FOR EACH ROW
  EXECUTE FUNCTION update_title_master_updated_at();

-- RLS 정책
ALTER TABLE title_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "title_master_select" ON title_master
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'executive', 'strategy', 'manager')
    )
  );

CREATE POLICY "title_master_insert" ON title_master
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'strategy')
    )
  );

CREATE POLICY "title_master_update" ON title_master
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'strategy')
    )
  );

CREATE POLICY "title_master_delete" ON title_master
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'strategy')
    )
  );
