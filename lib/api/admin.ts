import { supabase } from '../supabase';
import { updateUserRole } from './auth';

/**
 * 첫 관리자 계정 생성 유틸리티
 * 주의: 이 함수는 개발 환경에서만 사용하세요.
 * 프로덕션에서는 초대 시스템을 사용해야 합니다.
 */
export async function createFirstAdmin(email: string, password: string, name?: string) {
  try {
    // 1. 사용자 회원가입
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
      },
    });

    if (signUpError) throw signUpError;
    if (!signUpData.user) throw new Error('사용자 생성에 실패했습니다.');

    // 2. 프로필이 자동 생성될 때까지 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. 관리자 역할로 업데이트
    await updateUserRole(signUpData.user.id, 'admin');

    return {
      success: true,
      user: signUpData.user,
      message: '관리자 계정이 생성되었습니다.',
    };
  } catch (error: any) {
    console.error('관리자 계정 생성 오류:', error);
    throw error;
  }
}







