-- ========================================
-- 자유창작 데이터 작성자 정보 업데이트
-- ========================================
-- 박성준이 만든 모든 free-creation 데이터의 created_by를 업데이트합니다.

-- 1. 박성준의 user_id 찾기
DO $$
DECLARE
  park_user_id UUID;
BEGIN
  -- 박성준의 user_id 조회
  SELECT id INTO park_user_id
  FROM user_profiles
  WHERE name = '박성준'
  LIMIT 1;

  IF park_user_id IS NULL THEN
    RAISE EXCEPTION '박성준 사용자를 찾을 수 없습니다.';
  END IF;

  -- 2. free_creation_messages의 created_by 업데이트
  UPDATE free_creation_messages
  SET created_by = park_user_id
  WHERE created_by IS NULL;

  -- 3. free_creation_recent_references의 created_by 업데이트
  UPDATE free_creation_recent_references
  SET created_by = park_user_id
  WHERE created_by IS NULL;

  -- 4. reference_files의 created_by 업데이트 (free-creation에서 사용된 것들)
  -- description에 '자유창작' 또는 '캐릭터시트'가 포함된 레퍼런스 파일들
  UPDATE reference_files
  SET created_by = park_user_id
  WHERE created_by IS NULL
    AND (
      description LIKE '%자유창작%'
      OR description LIKE '%캐릭터시트%'
    );

  -- 5. files의 created_by 업데이트 (free-creation에서 생성된 이미지들)
  -- metadata에 source: 'free-creation'이 있거나 description이 '자유창작'인 파일들
  UPDATE files
  SET created_by = park_user_id
  WHERE created_by IS NULL
    AND (
      description = '자유창작'
      OR (metadata::jsonb->>'source') = 'free-creation'
      OR storage_path LIKE 'temp/free-creation/%'
    );

  RAISE NOTICE '박성준 사용자 ID: %', park_user_id;
  RAISE NOTICE '자유창작 데이터 작성자 정보 업데이트 완료';
END $$;
