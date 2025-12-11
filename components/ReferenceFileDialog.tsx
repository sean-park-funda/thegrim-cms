'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2 } from 'lucide-react';
import { ReferenceFileList } from './ReferenceFileList';
import { ReferenceFileUpload } from './ReferenceFileUpload';
import { getReferenceFilesByWebtoon } from '@/lib/api/referenceFiles';
import { getProcesses } from '@/lib/api/processes';
import { ReferenceFileWithProcess, Process, Webtoon } from '@/lib/supabase';
import { canCreateContent } from '@/lib/utils/permissions';
import { useStore } from '@/lib/store/useStore';

interface ReferenceFileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    webtoon: Webtoon;
}

export function ReferenceFileDialog({ open, onOpenChange, webtoon }: ReferenceFileDialogProps) {
    const { profile } = useStore();
    const [files, setFiles] = useState<ReferenceFileWithProcess[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [selectedProcessId, setSelectedProcessId] = useState<string>('all');
    const isMountedRef = useRef(true);

    const loadData = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        try {
            setLoading(true);
            const [filesData, processesData] = await Promise.all([
                getReferenceFilesByWebtoon(webtoon.id),
                getProcesses()
            ]);
            
            if (!isMountedRef.current) return;
            
            setFiles(filesData);
            setProcesses(processesData);
        } catch (error) {
            if (!isMountedRef.current) return;
            
            console.error('데이터 로드 실패:', error);
            alert('데이터를 불러오는데 실패했습니다.');
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [webtoon.id]);

    useEffect(() => {
        isMountedRef.current = true;
        
        if (open) {
            loadData();
        } else {
            // 다이얼로그가 닫힐 때 상태 초기화
            setFiles([]);
            setProcesses([]);
            setLoading(false);
        }

        return () => {
            isMountedRef.current = false;
        };
    }, [open, loadData]);

    const handleUploadComplete = () => {
        if (isMountedRef.current) {
            loadData();
        }
    };

    const handleFileDeleted = () => {
        if (isMountedRef.current) {
            loadData();
        }
    };

    // 선택된 공정에 따라 파일 필터링
    const filteredFiles = selectedProcessId === 'all'
        ? files
        : files.filter(file => file.process_id === selectedProcessId);

    // 공정별 파일 개수 계산
    const fileCountByProcess = files.reduce((acc, file) => {
        acc[file.process_id] = (acc[file.process_id] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{webtoon.title} - 레퍼런스 파일</DialogTitle>
                        <DialogDescription>
                            웹툰의 레퍼런스 파일을 관리합니다. 공정별로 분류되어 있습니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <Tabs value={selectedProcessId} onValueChange={setSelectedProcessId} className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between mb-4">
                                    <TabsList className="flex-wrap h-auto">
                                        <TabsTrigger value="all">
                                            전체 ({files.length})
                                        </TabsTrigger>
                                        {processes.map((process) => (
                                            <TabsTrigger key={process.id} value={process.id}>
                                                {process.name} ({fileCountByProcess[process.id] || 0})
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>

                                    {profile && canCreateContent(profile.role) && (
                                        <Button onClick={() => setUploadDialogOpen(true)} size="sm">
                                            <Plus className="h-4 w-4 mr-1" />
                                            파일 추가
                                        </Button>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    <TabsContent value="all" className="mt-0">
                                        <ReferenceFileList files={files} onFileDeleted={handleFileDeleted} />
                                    </TabsContent>
                                    {processes.map((process) => (
                                        <TabsContent key={process.id} value={process.id} className="mt-0">
                                            <ReferenceFileList
                                                files={filteredFiles}
                                                onFileDeleted={handleFileDeleted}
                                            />
                                        </TabsContent>
                                    ))}
                                </div>
                            </Tabs>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <ReferenceFileUpload
                open={uploadDialogOpen}
                onOpenChange={setUploadDialogOpen}
                webtoonId={webtoon.id}
                processes={processes}
                onUploadComplete={handleUploadComplete}
            />
        </>
    );
}
