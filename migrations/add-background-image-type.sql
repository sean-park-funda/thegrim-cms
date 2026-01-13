-- ========================================
-- 배경 이미지 타입 추가 마이그레이션
-- ========================================
-- 이 파일을 Supabase SQL Editor에서 실행하여 데이터베이스를 업데이트하세요.

-- episode_script_storyboard_images 테이블에 image_type 컬럼 추가
-- 값: 'cut' (기본값, 콘티 이미지), 'background' (배경 이미지)
ALTER TABLE episode_script_storyboard_images
ADD COLUMN IF NOT EXISTS image_type VARCHAR(20) DEFAULT 'cut';

-- 기존 데이터는 모두 'cut' 타입으로 설정
UPDATE episode_script_storyboard_images
SET image_type = 'cut'
WHERE image_type IS NULL;

-- 인덱스 추가 (image_type으로 필터링 성능 향상)
CREATE INDEX IF NOT EXISTS idx_storyboard_images_type ON episode_script_storyboard_images(storyboard_id, cut_index, image_type);

-- 마이그레이션 완료
-- 이제 콘티 이미지와 배경 이미지를 구분하여 관리할 수 있습니다.
