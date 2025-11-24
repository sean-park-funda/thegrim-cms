-- ========================================
-- Row Level Security (RLS) 정책 설정
-- 개발 단계용: 모든 사용자에게 읽기/쓰기 권한 부여
-- ========================================

-- 1. RLS 활성화 (이미 활성화되어 있다면 무시됨)
ALTER TABLE webtoons ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Public access" ON webtoons;
DROP POLICY IF EXISTS "Public access" ON episodes;
DROP POLICY IF EXISTS "Public access" ON cuts;
DROP POLICY IF EXISTS "Public access" ON processes;
DROP POLICY IF EXISTS "Public access" ON files;

-- 3. 모든 사용자에게 읽기/쓰기 권한 부여 (개발용)

-- 웹툰 테이블
CREATE POLICY "Public access" ON webtoons
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 회차 테이블
CREATE POLICY "Public access" ON episodes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 컷 테이블
CREATE POLICY "Public access" ON cuts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 공정 테이블
CREATE POLICY "Public access" ON processes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 파일 테이블
CREATE POLICY "Public access" ON files
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ========================================
-- Storage 정책 설정
-- ========================================

-- Storage 버킷에 대한 정책 (이미 있다면 삭제 후 재생성)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;

-- SELECT (읽기)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'webtoon-files' );

-- INSERT (업로드)
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'webtoon-files' );

-- UPDATE (수정)
CREATE POLICY "Public Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'webtoon-files' )
WITH CHECK ( bucket_id = 'webtoon-files' );

-- DELETE (삭제)
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'webtoon-files' );












