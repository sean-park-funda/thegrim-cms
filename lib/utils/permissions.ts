import { UserProfile } from '../api/auth';

export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer';

/**
 * 역할별 권한 체크 유틸리티 함수
 */

// 웹툰/회차/컷 생성 권한
export function canCreateContent(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

// 웹툰/회차/컷 수정 권한
export function canEditContent(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

// 웹툰/회차/컷 삭제 권한
export function canDeleteContent(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

// 파일 업로드 권한
export function canUploadFile(role: UserRole): boolean {
  return role === 'admin' || role === 'manager' || role === 'staff';
}

// 파일 다운로드 권한
export function canDownloadFile(role: UserRole): boolean {
  return true; // 모든 역할이 다운로드 가능
}

// 파일 삭제 권한
export function canDeleteFile(role: UserRole, fileOwnerId?: string, currentUserId?: string): boolean {
  if (role === 'admin' || role === 'manager') {
    return true; // 관리자와 매니저는 모든 파일 삭제 가능
  }
  if (role === 'staff' && fileOwnerId && currentUserId) {
    return fileOwnerId === currentUserId; // 스태프는 자신이 업로드한 파일만 삭제 가능
  }
  return false; // 조회자는 삭제 불가
}

// 공정 관리 권한
export function canManageProcesses(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

// 사용자 초대 권한
export function canInviteUsers(role: UserRole): boolean {
  return role === 'admin';
}

// 사용자 관리 권한
export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

// 모든 데이터 조회 권한
export function canViewContent(role: UserRole): boolean {
  return true; // 모든 역할이 조회 가능
}

