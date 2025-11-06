'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { searchFiles } from '@/lib/api/files';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileIcon, Search } from 'lucide-react';
import { FileWithRelations } from '@/lib/supabase';
import Image from 'next/image';

export function SearchResults() {
  const { searchQuery } = useStore();
  const [results, setResults] = useState<FileWithRelations[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      performSearch();
    } else {
      setResults([]);
    }
  }, [searchQuery]);

  const performSearch = async () => {
    try {
      setLoading(true);
      const data = await searchFiles(searchQuery);
      setResults(data);
    } catch (error: any) {
      console.error('검색 실패:', {
        query: searchQuery,
        error: error?.message || error,
        details: error?.details,
        code: error?.code
      });
      // 사용자에게 에러 표시
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const renderFilePreview = (file: FileWithRelations) => {
    const isImage = file.file_type === 'image';

    if (isImage) {
      return (
        <div className="relative w-32 h-32 bg-muted rounded-md overflow-hidden flex-shrink-0">
          <Image src={file.file_path} alt={file.file_name} fill className="object-cover" />
        </div>
      );
    }

    return (
      <div className="w-32 h-32 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
        <FileIcon className="h-12 w-12 text-muted-foreground" />
      </div>
    );
  };

  if (!searchQuery || searchQuery.trim().length < 2) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>검색어를 입력하세요 (최소 2자)</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">검색 중...</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">검색 결과</h2>
          <p className="text-sm text-muted-foreground">
            &quot;{searchQuery}&quot;에 대한 {results.length}개의 결과
          </p>
        </div>

        {results.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>검색 결과가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {results.map((file) => (
              <Card key={file.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {renderFilePreview(file)}
                    <div className="flex-1 min-w-0">
                      <div className="mb-2">
                        <p className="font-medium truncate">{file.file_name}</p>
                        {file.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                        )}
                      </div>
                      {file.cut?.episode?.webtoon && (
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">{file.cut.episode.webtoon.title}</span>
                            {' · '}
                            {file.cut.episode.episode_number}화
                            {' · '}
                            컷 {file.cut.cut_number}
                          </p>
                          {file.process && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: file.process.color }} />
                              <span className="text-muted-foreground">{file.process.name}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}


