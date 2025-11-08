'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { signOut } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Film, FolderTree, Search, LogOut, User, Settings } from 'lucide-react';
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
  const { viewMode, setViewMode, searchQuery, setSearchQuery, user, profile, setSelectedWebtoon } = useStore();

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
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 -ml-4 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" onClick={handleTitleClick}>
            <Film className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-base sm:text-xl font-bold truncate">더그림 작업관리 시스템</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button variant={viewMode === 'webtoon' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('webtoon')} className="px-2 sm:px-3">
              <Film className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">웹툰별 보기</span>
            </Button>
            <Button variant={viewMode === 'process' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('process')} className="px-2 sm:px-3">
              <FolderTree className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">공정별 보기</span>
            </Button>
          </div>

          <div className="flex-1 relative min-w-0 max-w-md">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="text" placeholder="파일 설명으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 sm:pl-10 text-sm" />
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {user && profile && profile.role === 'admin' && (
              <Button variant="outline" size="sm" onClick={() => router.push('/admin')} className="px-2 sm:px-3">
                <Settings className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">관리자</span>
              </Button>
            )}

            {user && profile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2 sm:px-3">
                    <User className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline truncate max-w-[100px]">{profile.name || profile.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{profile.name || profile.email}</span>
                      <span className="text-xs text-muted-foreground">{profile.role}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
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


