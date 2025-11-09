'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { signOut } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Film, FolderTree, Search, LogOut, User, Settings, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Navigation() {
  const router = useRouter();
  const { viewMode, setViewMode, searchQuery, setSearchQuery, setActiveSearchQuery, user, profile, setSelectedWebtoon } = useStore();

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
              className={`h-8 px-3 text-xs font-medium transition-colors duration-150 ${
                viewMode === 'webtoon' 
                  ? 'bg-background/20 text-background' 
                  : 'text-background/70 hover:text-background hover:bg-background/10'
              }`}
            >
              <Film className="h-3.5 w-3.5 mr-1.5" />
              웹툰
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewMode('process')} 
              className={`h-8 px-3 text-xs font-medium transition-colors duration-150 ${
                viewMode === 'process' 
                  ? 'bg-background/20 text-background' 
                  : 'text-background/70 hover:text-background hover:bg-background/10'
              }`}
            >
              <FolderTree className="h-3.5 w-3.5 mr-1.5" />
              공정
            </Button>
          </div>

          {/* 검색바 - Linear 스타일: 중앙에 적절한 크기 */}
          <div className="flex-1 relative max-w-md">
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

          {/* 오른쪽 액션 - Linear 스타일: 미니멀한 버튼 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
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
    </nav>
  );
}


