'use client';

import { useState, useEffect } from 'react';
import { ReferenceFileWithProcess } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Trash2, FileIcon, Search } from 'lucide-react';
import { deleteReferenceFile, getReferenceFileThumbnailUrl, generateReferenceThumbnail } from '@/lib/api/referenceFiles';
import { canDeleteContent } from '@/lib/utils/permissions';
import { useStore } from '@/lib/store/useStore';
import { ImageViewer } from './ImageViewer';

interface ReferenceFileListProps {
    files: ReferenceFileWithProcess[];
    onFileDeleted?: () => void;
}

export function ReferenceFileList({ files, onFileDeleted }: ReferenceFileListProps) {
    const { profile } = useStore();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState<{ url: string; name: string } | null>(null);
    const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
    const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<string>>(new Set());

    // 썸네일 URL 가져오기 및 백그라운드 생성
    useEffect(() => {
        const loadThumbnails = async () => {
            const urls: Record<string, string> = {};
            const filesToGenerate: string[] = [];

            for (const file of files) {
                if (file.file_type === 'image') {
                    try {
                        const thumbnailUrl = await getReferenceFileThumbnailUrl(file);
                        urls[file.id] = thumbnailUrl;

                        // 썸네일이 없으면 백그라운드에서 생성 요청
                        if (!file.thumbnail_path) {
                            filesToGenerate.push(file.id);
                        }
                    } catch (error) {
                        console.error(`썸네일 URL 가져오기 실패 (${file.id}):`, error);
                        urls[file.id] = file.file_path; // 실패 시 원본 사용
                    }
                }
            }
            setThumbnailUrls(urls);

            // 백그라운드에서 썸네일 생성 요청
            if (filesToGenerate.length > 0) {
                filesToGenerate.forEach((fileId) => {
                    setGeneratingThumbnails((prev) => new Set(prev).add(fileId));
                    
                    generateReferenceThumbnail(fileId)
                        .then((thumbnailUrl) => {
                            setThumbnailUrls((prev) => ({
                                ...prev,
                                [fileId]: thumbnailUrl,
                            }));
                            // 파일 목록 새로고침을 위해 부모 컴포넌트에 알림
                            // (선택사항: 썸네일이 생성되면 자동으로 업데이트)
                        })
                        .catch((error) => {
                            console.error(`썸네일 생성 실패 (${fileId}):`, error);
                        })
                        .finally(() => {
                            setGeneratingThumbnails((prev) => {
                                const next = new Set(prev);
                                next.delete(fileId);
                                return next;
                            });
                        });
                });
            }
        };

        if (files.length > 0) {
            loadThumbnails();
        }
    }, [files]);

    const handleImageClick = (file: ReferenceFileWithProcess) => {
        if (file.file_type === 'image') {
            setViewerImage({ url: file.file_path, name: file.file_name });
            setViewerOpen(true);
        }
    };

    // 공정별로 파일 그룹화
    const filesByProcess = files.reduce((acc, file) => {
        const processName = file.process?.name || '미지정';
        if (!acc[processName]) {
            acc[processName] = [];
        }
        acc[processName].push(file);
        return acc;
    }, {} as Record<string, ReferenceFileWithProcess[]>);

    const handleDelete = async (fileId: string, fileName: string) => {
        if (!confirm(`"${fileName}" 파일을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            setDeletingId(fileId);
            await deleteReferenceFile(fileId);
            alert('레퍼런스 파일이 삭제되었습니다.');
            onFileDeleted?.();
        } catch (error) {
            console.error('레퍼런스 파일 삭제 실패:', error);
            alert('레퍼런스 파일 삭제에 실패했습니다.');
        } finally {
            setDeletingId(null);
        }
    };

    const handleDownload = (file: ReferenceFileWithProcess) => {
        window.open(file.file_path, '_blank');
    };

    if (files.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>등록된 레퍼런스 파일이 없습니다.</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                {Object.entries(filesByProcess).map(([processName, processFiles]) => (
                    <div key={processName}>
                        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                            {processName} ({processFiles.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {processFiles.map((file) => (
                                <Card key={file.id} className="overflow-hidden p-0">
                                    {/* 파일 미리보기 */}
                                    <div
                                        className={`aspect-video bg-muted flex items-center justify-center overflow-hidden relative ${file.file_type === 'image' ? 'cursor-pointer group' : ''}`}
                                        onClick={() => handleImageClick(file)}
                                    >
                                        {file.file_type === 'image' ? (
                                            <>
                                                <img
                                                    src={thumbnailUrls[file.id] || file.file_path}
                                                    alt={file.file_name}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                                                        <Search className="h-5 w-5 text-white" />
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <FileIcon className="h-12 w-12 text-muted-foreground" />
                                        )}
                                    </div>

                                    <CardContent className="p-2">
                                        {/* 파일 정보 */}
                                        <div className="space-y-1 mb-2">
                                            <p className="text-sm font-medium line-clamp-1" title={file.file_name}>
                                                {file.file_name}
                                            </p>
                                            {file.description && (
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {file.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {file.file_size ? `${(file.file_size / 1024 / 1024).toFixed(2)} MB` : ''}
                                            </p>
                                        </div>

                                        {/* 액션 버튼 */}
                                        <div className="flex gap-2 justify-end">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDownload(file)}
                                                title="다운로드"
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            {profile && canDeleteContent(profile.role) && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleDelete(file.id, file.file_name)}
                                                    disabled={deletingId === file.id}
                                                    className="text-destructive hover:text-destructive"
                                                    title="삭제"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 이미지 전체화면 뷰어 */}
            {viewerImage && (
                <ImageViewer
                    imageUrl={viewerImage.url}
                    imageName={viewerImage.name}
                    open={viewerOpen}
                    onOpenChange={setViewerOpen}
                />
            )}
        </>
    );
}
