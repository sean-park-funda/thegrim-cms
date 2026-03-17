import { UserProfile } from '../api/auth';

export type UserRole = 'admin' | 'executive' | 'manager' | 'staff' | 'viewer' | 'accountant' | 'strategy';

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

// ========================================
// 회계 시스템 권한
// ========================================

// 회계 데이터 조회 권한
export function canViewAccounting(role: UserRole): boolean {
  return role === 'admin' || role === 'executive' || role === 'accountant';
}

// 회계 데이터 생성/수정 권한
export function canManageAccounting(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

// 거래 내역 승인 권한
export function canApproveTransactions(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

// 회계 카테고리 관리 권한
export function canManageAccountingCategories(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

// 예산 설정 권한
export function canManageBudgets(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

// 회계 보고서 조회 권한
export function canViewAccountingReports(role: UserRole): boolean {
  return role === 'admin' || role === 'executive' || role === 'accountant';
}

// ========================================
// 전략팀 권한
// ========================================

// 전략팀 여부 확인
export function isStrategy(role: UserRole): boolean {
  return role === 'strategy';
}

// 전략팀 접근 권한 (향후 전략팀 전용 기능에 사용)
export function canAccessStrategy(role: UserRole): boolean {
  return role === 'admin' || role === 'strategy';
}

// 전략팀의 회계 보고서 조회 (임원과 동일 수준)
export function canViewAccountingAsStrategy(role: UserRole): boolean {
  return role === 'admin' || role === 'executive' || role === 'accountant' || role === 'strategy';
}

