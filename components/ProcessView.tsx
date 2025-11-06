'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getProcesses } from '@/lib/api/processes';
import { getFilesByProcess } from '@/lib/api/files';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Settings, FileIcon } from 'lucide-react';
import { Process, FileWithRelations } from '@/lib/supabase';
import Image from 'next/image';

export function ProcessView() {
  const { processes, setProcesses, selectedProcess, setSelectedProcess } = useStore();
  const [files, setFiles] = useState<FileWithRelations[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcess) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [selectedProcess]);

  const loadProcesses = async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  };

  const loadFiles = async () => {
    if (!selectedProcess) return;

    try {
      setLoading(true);
      const data = await getFilesByProcess(selectedProcess.id);
      setFiles(data);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderFilePreview = (file: FileWithRelations) => {
    const isImage = file.file_type === 'image';

    if (isImage) {
      return (
        <div className="relative w-full h-64 bg-muted rounded-md overflow-hidden">
          <Image src={file.file_path} alt={file.file_name} fill className="object-cover" />
        </div>
      );
    }

    return (
      <div className="w-full h-64 bg-muted rounded-md flex items-center justify-center">
        <FileIcon className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  };

  return (
    <div className="grid grid-cols-12 h-full divide-x">
      <div className="col-span-3">
        <ScrollArea className="h-full">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">공정 목록</h2>
              <Button size="sm" variant="ghost">
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {processes.map((process) => (
                <Card key={process.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedProcess?.id === process.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedProcess(process)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: process.color }} />
                      <CardTitle className="text-base">{process.name}</CardTitle>
                    </div>
                  </CardHeader>
                  {process.description && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground">{process.description}</p>
                    </CardContent>
                  )}
                </Card>
              ))}

              <Button variant="outline" className="w-full" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                새 공정 추가
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-9">
        <ScrollArea className="h-full">
          <div className="p-4">
            {!selectedProcess ? (
              <div className="text-center text-muted-foreground py-12">
                <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>공정을 선택해주세요</p>
              </div>
            ) : loading ? (
              <div className="text-center text-muted-foreground py-12">로딩 중...</div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedProcess.color }} />
                    <h2 className="text-2xl font-bold">{selectedProcess.name}</h2>
                    <Badge>{files.length}개 파일</Badge>
                  </div>
                  {selectedProcess.description && (
                    <p className="text-muted-foreground">{selectedProcess.description}</p>
                  )}
                </div>

                {files.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>이 공정에 업로드된 파일이 없습니다</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file) => (
                      <Card key={file.id} className="overflow-hidden">
                        {renderFilePreview(file)}
                        <div className="p-4">
                          <div className="mb-2">
                            <p className="font-medium truncate">{file.file_name}</p>
                            {file.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                            )}
                          </div>
                          {file.cut?.episode?.webtoon && (
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p className="truncate">{file.cut.episode.webtoon.title}</p>
                              <p>{file.cut.episode.episode_number}화 - 컷 {file.cut.cut_number}</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}


