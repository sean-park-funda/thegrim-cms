'use client';

import { useStore } from '@/lib/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Film, FolderTree, Search } from 'lucide-react';

export function Navigation() {
  const { viewMode, setViewMode, searchQuery, setSearchQuery } = useStore();

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">웹툰 제작 관리 CMS</h1>
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
          </div>
        </div>
      </div>
    </nav>
  );
}


