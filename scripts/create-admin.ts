/**
 * 첫 관리자 계정 생성 스크립트
 * 
 * 사용법:
 * 1. .env.local 파일에 Supabase 설정이 있는지 확인
 * 2. 이 파일을 실행: npx tsx scripts/create-admin.ts
 * 
 * 또는 브라우저 콘솔에서:
 * import { createFirstAdmin } from '@/lib/api/admin';
 * await createFirstAdmin('sungjunpark7392@gmail.com', '123456');
 */

import { createFirstAdmin } from '../lib/api/admin';

async function main() {
  const email = 'sungjunpark7392@gmail.com';
  const password = '123456';
  const name = '관리자';

  try {
    console.log('관리자 계정 생성 중...');
    const result = await createFirstAdmin(email, password, name);
    console.log('✅ 성공:', result.message);
    console.log('사용자 ID:', result.user?.id);
  } catch (error: any) {
    console.error('❌ 오류:', error.message);
    if (error.message.includes('already registered')) {
      console.log('이미 등록된 이메일입니다. 역할만 업데이트합니다...');
      // 역할 업데이트는 별도로 수행해야 합니다.
    }
  }
}

// 직접 실행 시
if (require.main === module) {
  main();
}

export { main };










