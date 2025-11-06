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
  const { viewMode, setViewMode, searchQuery, setSearchQuery, user, profile } = useStore();

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

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 -ml-4 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push('/')}>
            <Film className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">더그림 작업관리 시스템</h1>
          </div>

          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            <div className="flex gap-2">
              <Button variant={viewMode === 'webtoon' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('webtoon')}>
                <Film className="h-4 w-4 mr-2" />
                웹툰별 보기
              </Button>
              <Button variant={viewMode === 'process' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('process')}>
                <FolderTree className="h-4 w-4 mr-2" />
                공정별 보기
              </Button>
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="text" placeholder="파일 설명으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>

            {user && profile && profile.role === 'admin' && (
              <Button variant="outline" size="sm" onClick={() => router.push('/admin')}>
                <Settings className="h-4 w-4 mr-2" />
                관리자
              </Button>
            )}

            {user && profile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    {profile.name || profile.email}
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


