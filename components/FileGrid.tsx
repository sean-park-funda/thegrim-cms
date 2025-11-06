'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getFilesByCut, uploadFile, deleteFile } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileIcon, Download, Trash2, Upload, Plus } from 'lucide-react';
import { File as FileType } from '@/lib/supabase';
import Image from 'next/image';
import { useDropzone } from 'react-dropzone';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';

export function FileGrid() {
  const { selectedCut, processes, setProcesses, profile } = useStore();
  const [files, setFiles] = useState<FileType[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, globalThis.File[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, Record<string, number>>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProcesses = useCallback(async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  }, [setProcesses]);

  const loadFiles = useCallback(async () => {
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
  }, [selectedCut]);

  useEffect(() => {
    loadProcesses();
  }, [loadProcesses]);

  useEffect(() => {
    if (selectedCut) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [selectedCut, loadFiles]);

  const getFilesByProcess = (processId: string) => {
    return files.filter(file => file.process_id === processId);
  };

  const handleFileUpload = useCallback(async (acceptedFiles: globalThis.File[], processId: string) => {
    if (!selectedCut) return;

    setUploadingFiles(prev => ({ ...prev, [processId]: acceptedFiles }));

    try {
      for (const file of acceptedFiles) {
        try {
          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 0 }
          }));

          await uploadFile(file, selectedCut.id, processId, '');

          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 100 }
          }));
        } catch (error) {
          console.error(`파일 업로드 실패 (${file.name}):`, error);
          alert(`${file.name} 업로드에 실패했습니다.`);
        }
      }

      await loadFiles();
      setUploadingFiles(prev => {
        const newState = { ...prev };
        delete newState[processId];
        return newState;
      });
      setUploadProgress(prev => {
        const newState = { ...prev };
        delete newState[processId];
        return newState;
      });
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      alert('파일 업로드에 실패했습니다.');
    }
  }, [selectedCut, loadFiles]);

  const handleDownload = async (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(file.file_path);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('파일 다운로드 실패:', error);
      alert('파일 다운로드에 실패했습니다.');
    }
  };

  const handleDeleteClick = (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;

    try {
      setDeleting(true);
      await deleteFile(fileToDelete.id);
      await loadFiles();
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      alert('파일이 삭제되었습니다.');
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      alert('파일 삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const renderFilePreview = (file: FileType) => {
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
            const processUploadingFiles = uploadingFiles[process.id] || [];
            const processProgress = uploadProgress[process.id] || {};

            const ProcessDropzone = ({ children }: { children: (open: () => void) => React.ReactNode }) => {
              const canUpload = profile && canUploadFile(profile.role);
              
              const onDrop = (acceptedFiles: globalThis.File[]) => {
                if (!canUpload) return;
                handleFileUpload(acceptedFiles, process.id);
              };

              const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
                onDrop,
                accept: {
                  'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
                  'application/pdf': ['.pdf'],
                  'application/postscript': ['.ps', '.ai'],
                  'application/vnd.adobe.photoshop': ['.psd']
                },
                maxSize: 100 * 1024 * 1024,
                noClick: true,
                disabled: !canUpload
              });

              return (
                <div
                  {...getRootProps()}
                  className={`relative ${isDragActive ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                >
                  <input {...getInputProps()} />
                  {children(open)}
                  {isDragActive && (
                    <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
                      <div className="text-center">
                        <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
                        <p className="text-primary font-medium">파일을 여기에 놓으세요</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <Card key={process.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: process.color }} />
                    <CardTitle className="text-base">{process.name}</CardTitle>
                    <Badge variant="outline">{processFiles.length}개</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ProcessDropzone>
                    {(open) => (
                      <>
                        {processUploadingFiles.length > 0 && (
                          <div className="mb-4 space-y-2 p-4 bg-muted rounded-lg">
                            <p className="text-sm font-medium mb-2">업로드 중...</p>
                            {processUploadingFiles.map((file: globalThis.File) => (
                              <div key={file.name} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="truncate flex-1">{file.name}</span>
                                  <span className="text-muted-foreground ml-2">
                                    {processProgress[file.name] || 0}%
                                  </span>
                                </div>
                                <div className="w-full bg-background rounded-full h-2">
                                  <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${processProgress[file.name] || 0}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {processFiles.length === 0 ? (
                          <div className="py-12 text-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
                            {profile && canUploadFile(profile.role) ? (
                              <>
                                <Upload className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="text-sm text-muted-foreground mb-1">파일을 드래그하여 업로드</p>
                                <p className="text-xs text-muted-foreground">또는 클릭하여 파일 선택</p>
                              </>
                            ) : (
                              <>
                                <FileIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="text-sm text-muted-foreground">파일이 없습니다</p>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {/* 업로드 버튼 카드 */}
                            {profile && canUploadFile(profile.role) && (
                              <Card 
                                className="overflow-hidden border-dashed opacity-40 hover:opacity-100 transition-opacity cursor-pointer group"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  open();
                                }}
                              >
                                <div className="w-full h-48 bg-muted/50 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground/30 group-hover:border-primary/50">
                                  <Plus className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="p-3 text-center">
                                  <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">파일 추가</p>
                                </div>
                              </Card>
                            )}
                            {processFiles.map((file: FileType) => (
                              <Card key={file.id} className="overflow-hidden">
                                {renderFilePreview(file)}
                                <div className="p-3">
                                  <p className="text-sm font-medium truncate">{file.file_name}</p>
                                  {file.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                                  )}
                                  <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="ghost" className="h-7 px-2 flex-1" onClick={(e) => handleDownload(file, e)}>
                                      <Download className="h-3 w-3" />
                                    </Button>
                                    {profile && canDeleteFile(profile.role) && (
                                      <Button size="sm" variant="ghost" className="h-7 px-2 flex-1 text-destructive hover:text-destructive" onClick={(e) => handleDeleteClick(file, e)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </ProcessDropzone>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 파일 삭제 확인 Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>파일 삭제</DialogTitle>
            <DialogDescription>정말로 이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</DialogDescription>
          </DialogHeader>
          {fileToDelete && (
            <div className="py-4">
              <p className="text-sm font-medium">{fileToDelete.file_name}</p>
              {fileToDelete.description && (
                <p className="text-sm text-muted-foreground mt-1">{fileToDelete.description}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? '삭제 중...' : '삭제'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}


