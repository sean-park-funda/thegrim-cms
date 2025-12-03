'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { signOut } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Film, FolderTree, Search, LogOut, User, Settings, X, Wand2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
export function Navigation() {
  const router = useRouter();
  const { viewMode, setViewMode, searchQuery, setSearchQuery, setActiveSearchQuery, user, profile, setSelectedWebtoon } = useStore();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setActiveSearchQuery(searchQuery.trim());
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery('');
  };

  const handleLogout = async () => {
    try {
      await signOut();
      useStore.getState().setUser(null);
      useStore.getState().setProfile(null);
      router.push('/login');
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  const handleTitleClick = () => {
    setSelectedWebtoon(null);
    router.push('/');
  };

  // 모바일 검색 다이얼로그가 열릴 때 입력 필드에 자동 포커스
  useEffect(() => {
    if (mobileSearchOpen && searchInputRef.current) {
      // 약간의 지연을 두어 다이얼로그 애니메이션과 동기화
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mobileSearchOpen]);

  const handleMobileSearchSubmit = () => {
    setActiveSearchQuery(searchQuery.trim());
    setMobileSearchOpen(false);
  };

  const handleMobileSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleMobileSearchSubmit();
    }
  };

  return (
    <nav className="border-b border-border/20 bg-foreground shadow-sm">
      <div className="container mx-auto max-w-[1600px] px-4 sm:px-6">
        <div className="flex items-center h-14 gap-6">
          {/* 타이틀 - Linear 스타일: 왼쪽에 깔끔하게 */}
          <div className="cursor-pointer hover:opacity-80 transition-opacity duration-150 flex-shrink-0" onClick={handleTitleClick}>
            <h1 className="text-sm font-bold" style={{ color: '#00BFFF' }}>더그림 CMS</h1>
          </div>

          {/* 탭 네비게이션 - Linear 스타일: 미니멀한 탭 */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewMode('webtoon')} 
              className={`h-8 px-2 sm:px-3 text-xs font-medium transition-colors duration-150 ${
                viewMode === 'webtoon' 
                  ? 'bg-background/20 text-background' 
                  : 'text-background/70 hover:text-background hover:bg-background/10'
              }`}
            >
              <Film className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">웹툰</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewMode('process')} 
              className={`h-8 px-2 sm:px-3 text-xs font-medium transition-colors duration-150 ${
                viewMode === 'process' 
                  ? 'bg-background/20 text-background' 
                  : 'text-background/70 hover:text-background hover:bg-background/10'
              }`}
            >
              <FolderTree className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">공정</span>
            </Button>
          </div>

          {/* 검색바 - PC: 검색창, 모바일: 검색 아이콘 */}
          {/* PC 검색창 (md 이상에서만 표시) */}
          <div className="hidden md:flex flex-1 relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-background/60 pointer-events-none" />
            <Input 
              type="text" 
              placeholder="검색... (Enter)" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-9 pr-9 h-8 text-xs bg-background/10 border-background/20 text-background placeholder:text-background/50 focus-visible:ring-1 focus-visible:ring-background/30" 
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-background/60 hover:text-background transition-colors"
                aria-label="검색 초기화"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 모바일 검색 아이콘 (md 미만에서만 표시) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileSearchOpen(true)}
            className="md:hidden h-8 w-8 p-0 text-background/70 hover:text-background hover:bg-background/10"
            aria-label="검색"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* 오른쪽 액션 - Linear 스타일: 미니멀한 버튼 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user && profile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/comfy-test')}
                className="h-8 w-8 p-0 text-background/70 hover:text-background hover:bg-background/10"
                title="ComfyUI 테스트"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            )}
            {user && profile && profile.role === 'admin' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/admin')}
                className="h-8 w-8 p-0 text-background/70 hover:text-background hover:bg-background/10"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}

            {user && profile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-2 text-xs font-medium text-background/70 hover:text-background hover:bg-background/10"
                  >
                    <User className="h-3.5 w-3.5 mr-1.5" />
                    <span className="hidden sm:inline truncate max-w-[120px]">{profile.name || profile.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="text-sm">{profile.name || profile.email}</span>
                      <span className="text-xs text-muted-foreground font-normal">{profile.role}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-xs">
                    <LogOut className="h-3.5 w-3.5 mr-2" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* 모바일 검색 다이얼로그 */}
      <Dialog open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
        <DialogContent 
          showCloseButton={false}
          className="md:hidden !fixed !top-0 !inset-x-0 !bottom-auto !translate-x-0 !translate-y-0 data-[state=open]:!translate-y-0 data-[state=closed]:!translate-y-[-100%] !rounded-b-lg !rounded-t-none !border-t-0 !border-x-0 !p-0 !gap-0 !max-w-none !w-full !h-auto !min-h-[200px] !m-0 !box-border overflow-x-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top duration-200"
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold">검색</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileSearchOpen(false)}
                className="h-8 w-8 p-0 -mr-2"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="px-4 py-4 pb-6 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input 
                ref={searchInputRef}
                type="text" 
                placeholder="검색어를 입력하세요..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleMobileSearchKeyDown}
                className="pl-9 pr-9 h-12 text-base bg-background border-border w-full" 
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
                  aria-label="검색 초기화"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleMobileSearchSubmit}
                className="flex-1 h-11 text-base"
                disabled={!searchQuery.trim()}
              >
                검색
              </Button>
              <Button 
                variant="outline"
                onClick={() => setMobileSearchOpen(false)}
                className="h-11 px-4 text-base"
              >
                취소
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </nav>
  );
}


