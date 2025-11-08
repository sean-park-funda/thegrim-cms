-- ========================================
-- 테스트 사용자 초기화 스크립트
-- sjpark@funda.kr 계정 삭제 (초대는 유지)
-- ========================================

-- 사용자 계정 삭제 (CASCADE로 프로필도 자동 삭제)
DELETE FROM auth.users
WHERE email = 'sjpark@funda.kr';

-- 삭제 확인
SELECT 
  'user' as type,
  COUNT(*) as count
FROM auth.users
WHERE email = 'sjpark@funda.kr'
UNION ALL
SELECT 
  'profile' as type,
  COUNT(*) as count
FROM user_profiles
WHERE email = 'sjpark@funda.kr'
UNION ALL
SELECT 
  'invitation' as type,
  COUNT(*) as count
FROM invitations
WHERE email = 'sjpark@funda.kr';

-- 초대 정보 확인
SELECT 
  id,
  email,
  role,
  token,
  used_at,
  expires_at,
  created_at
FROM invitations
WHERE email = 'sjpark@funda.kr'
ORDER BY created_at DESC
LIMIT 1;


