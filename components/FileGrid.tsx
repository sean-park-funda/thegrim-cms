'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getFilesByCut } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, FileIcon, Download, Trash2 } from 'lucide-react';
import { File, Process } from '@/lib/supabase';
import Image from 'next/image';

export function FileGrid() {
  const { selectedCut, processes, setProcesses } = useStore();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedCut) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [selectedCut]);

  const loadProcesses = async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  };

  const loadFiles = async () => {
    if (!selectedCut) return;

    try {
      setLoading(true);
      const data = await getFilesByCut(selectedCut.id);
      setFiles(data);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilesByProcess = (processId: string) => {
    return files.filter(file => file.process_id === processId);
  };

  const renderFilePreview = (file: File) => {
    const isImage = file.file_type === 'image';

    if (isImage) {
      return (
        <div className="relative w-full h-48 bg-muted rounded-md overflow-hidden">
          <Image src={file.file_path} alt={file.file_name} fill className="object-cover" />
        </div>
      );
    }

    return (
      <div className="w-full h-48 bg-muted rounded-md flex items-center justify-center">
        <FileIcon className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  };

  if (!selectedCut) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>컷을 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">공정별 파일</h2>
          <p className="text-sm text-muted-foreground">컷 {selectedCut.cut_number}의 제작 파일들</p>
        </div>

        <div className="space-y-6">
          {processes.map((process) => {
            const processFiles = getFilesByProcess(process.id);

            return (
              <Card key={process.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: process.color }} />
                      <CardTitle className="text-base">{process.name}</CardTitle>
                      <Badge variant="outline">{processFiles.length}개</Badge>
                    </div>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      업로드
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {processFiles.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      업로드된 파일이 없습니다
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {processFiles.map((file) => (
                        <Card key={file.id} className="overflow-hidden">
                          {renderFilePreview(file)}
                          <div className="p-3">
                            <p className="text-sm font-medium truncate">{file.file_name}</p>
                            {file.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="ghost" className="h-7 px-2 flex-1">
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 flex-1 text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}


