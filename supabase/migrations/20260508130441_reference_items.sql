-- 의상/소품 레퍼런스 아이템 저장소
CREATE TABLE IF NOT EXISTS reference_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('outfit', 'prop')),
  name TEXT NOT NULL DEFAULT '이름 없음',
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  file_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  parent_id UUID REFERENCES reference_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reference_items_webtoon_type_idx ON reference_items(webtoon_id, type);
CREATE INDEX IF NOT EXISTS reference_items_webtoon_idx ON reference_items(webtoon_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_reference_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reference_items_updated_at
  BEFORE UPDATE ON reference_items
  FOR EACH ROW EXECUTE FUNCTION update_reference_items_updated_at();

-- RLS 비활성화 (기존 테이블들과 동일한 패턴)
ALTER TABLE reference_items DISABLE ROW LEVEL SECURITY;
