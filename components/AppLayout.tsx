'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useStore } from '@/lib/store/useStore';
import { Navigation } from '@/components/Navigation';
import { BreadcrumbNav } from '@/components/BreadcrumbNav';
import { ImageModelProvider } from '@/lib/contexts/ImageModelContext';
import { getUnreadAnnouncements, Announcement } from '@/lib/api/announcements';
import AnnouncementModal from '@/components/AnnouncementModal';

// 인증이 필요 없는 페이지 경로
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAuth();

  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading } = useStore();
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const hasCheckedAnnouncements = useRef(false);

  // 비로그인 상태에서 인증이 필요한 페이지 접근 시 /login으로 리다이렉트
  useEffect(() => {
    // 로딩 중이면 리다이렉트하지 않음
    if (isLoading) return;
    
    // 현재 경로가 공개 경로인지 확인
    const isPublicPath = PUBLIC_PATHS.some(path => pathname?.startsWith(path));
    
    // 비로그인 상태이고 공개 경로가 아닌 경우 /login으로 리다이렉트
    if (!user && !isPublicPath) {
      router.push('/login');
    }
  }, [user, isLoading, pathname, router]);

  // 읽지 않은 공지사항 로드
  const loadUnreadAnnouncements = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const announcements = await getUnreadAnnouncements(profile.id);
      if (announcements.length > 0) {
        setUnreadAnnouncements(announcements);
        setShowAnnouncementModal(true);
      }
    } catch (error) {
      console.error('읽지 않은 공지사항 로드 오류:', error);
    }
  }, [profile?.id]);

  // 로그인 완료 후 공지사항 체크
  useEffect(() => {
    // 로딩 중이거나 이미 체크했으면 스킵
    if (isLoading || hasCheckedAnnouncements.current) return;

    // 로그인된 상태에서만 체크
    if (user && profile?.id) {
      hasCheckedAnnouncements.current = true;
      loadUnreadAnnouncements();
    }
  }, [isLoading, user, profile?.id, loadUnreadAnnouncements]);

  // 로그아웃 시 상태 리셋
  useEffect(() => {
    if (!user) {
      hasCheckedAnnouncements.current = false;
      setUnreadAnnouncements([]);
      setShowAnnouncementModal(false);
    }
  }, [user]);

  // 모달 닫기 핸들러
  const handleCloseModal = useCallback(() => {
    setShowAnnouncementModal(false);
  }, []);

  // 모든 공지 읽음 처리 후 핸들러
  const handleAllRead = useCallback(() => {
    setUnreadAnnouncements([]);
  }, []);

  return (
    <ImageModelProvider>
      <div className="flex flex-col h-screen bg-background">
        <Navigation />
        <BreadcrumbNav />
        <div className="flex-1 min-h-0 bg-background">
          {children}
        </div>

        {/* 공지사항 모달 */}
        {showAnnouncementModal && unreadAnnouncements.length > 0 && profile?.id && (
          <AnnouncementModal
            announcements={unreadAnnouncements}
            userId={profile.id}
            onClose={handleCloseModal}
            onAllRead={handleAllRead}
          />
        )}
      </div>
    </ImageModelProvider>
  );
}
