'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useStore } from '@/lib/store/useStore';
import { Navigation } from '@/components/Navigation';
import { BreadcrumbNav } from '@/components/BreadcrumbNav';
import { ImageModelProvider } from '@/lib/contexts/ImageModelContext';
import { getUnreadAnnouncements, Announcement } from '@/lib/api/announcements';
import AnnouncementModal from '@/components/AnnouncementModal';

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAuth();

  const { user, profile, isLoading } = useStore();
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const hasCheckedAnnouncements = useRef(false);

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
