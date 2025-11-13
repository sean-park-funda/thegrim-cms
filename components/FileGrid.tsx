'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getFilesByCut, uploadFile, deleteFile, updateFile, analyzeImage } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileIcon, Download, Trash2, Upload, Plus, Edit, Sparkles, Calendar, HardDrive } from 'lucide-react';
import { format } from 'date-fns';
import { File as FileType } from '@/lib/supabase';
import Image from 'next/image';
import { useDropzone } from 'react-dropzone';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { cn } from '@/lib/utils';

export function FileGrid() {
  const { selectedCut, processes, setProcesses, profile } = useStore();
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<FileType[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, globalThis.File[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, Record<string, number>>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [fileToEdit, setFileToEdit] = useState<FileType | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
  const [pendingAnalysisFiles, setPendingAnalysisFiles] = useState<Set<string>>(new Set());
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [fileToView, setFileToView] = useState<FileType | null>(null);

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
      setImageErrors(new Set()); // 파일 로드 시 이미지 에러 상태 초기화
      const data = await getFilesByCut(selectedCut.id);
      setFiles(data);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
      setImageErrors(new Set());
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
    // 컷이 변경되면 대기 목록 초기화
    setPendingAnalysisFiles(new Set());
  }, [selectedCut, loadFiles]);

  // 메타데이터가 없는 이미지 파일들에 대해 주기적으로 폴링
  useEffect(() => {
    if (!selectedCut || pendingAnalysisFiles.size === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const currentFiles = await getFilesByCut(selectedCut.id);
        
        // 메타데이터가 생성된 파일들 확인
        const updatedFiles: string[] = [];
        const stillPending: string[] = [];

        pendingAnalysisFiles.forEach((fileId) => {
          const file = currentFiles.find(f => f.id === fileId);
          if (file) {
            const metadata = file.metadata as {
              scene_summary?: string;
              tags?: string[];
            } | undefined;
            
            if (metadata && metadata.scene_summary && metadata.tags) {
              // 메타데이터가 생성됨
              updatedFiles.push(fileId);
            } else {
              // 아직 메타데이터 없음
              stillPending.push(fileId);
            }
          }
        });

        // 메타데이터가 생성된 파일이 있으면 파일 목록 업데이트
        if (updatedFiles.length > 0) {
          console.log('[FileGrid] 메타데이터 생성 완료된 파일:', updatedFiles);
          setPendingAnalysisFiles(prev => {
            const newSet = new Set(prev);
            updatedFiles.forEach(id => newSet.delete(id));
            return newSet;
          });
          // 파일 목록 다시 로드
          await loadFiles();
        }

        // 모든 파일의 메타데이터가 생성되었으면 폴링 중지
        if (stillPending.length === 0) {
          setPendingAnalysisFiles(new Set());
        }
      } catch (error) {
        console.error('[FileGrid] 폴링 중 오류:', error);
      }
    }, 3000); // 3초마다 확인

    return () => clearInterval(pollInterval);
  }, [selectedCut, pendingAnalysisFiles, loadFiles]);

  const getFilesByProcess = (processId: string) => {
    return files.filter(file => file.process_id === processId);
  };

  const handleFileUpload = useCallback(async (acceptedFiles: globalThis.File[], processId: string) => {
    if (!selectedCut) return;

    setUploadingFiles(prev => ({ ...prev, [processId]: acceptedFiles }));

    try {
      const uploadedImageIds: string[] = [];

      for (const file of acceptedFiles) {
        try {
          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 0 }
          }));

          const uploadedFile = await uploadFile(file, selectedCut.id, processId, '');

          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 100 }
          }));

          // 이미지 파일인 경우 메타데이터 생성 대기 목록에 추가
          if (uploadedFile.file_type === 'image') {
            uploadedImageIds.push(uploadedFile.id);
          }
        } catch (error) {
          console.error(`파일 업로드 실패 (${file.name}):`, error);
          alert(`${file.name} 업로드에 실패했습니다.`);
        }
      }

      await loadFiles();

      // 업로드된 이미지 파일들을 메타데이터 생성 대기 목록에 추가
      if (uploadedImageIds.length > 0) {
        setPendingAnalysisFiles(prev => {
          const newSet = new Set(prev);
          uploadedImageIds.forEach(id => newSet.add(id));
          return newSet;
        });
      }

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

  const handleEditClick = (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    // 빈 문자열일 때만 수정 가능
    if (file.description && file.description.trim() !== '') {
      alert('이미 설명이 있는 파일입니다. AI 자동 생성 후에는 수정할 수 없습니다.');
      return;
    }
    setFileToEdit(file);
    setEditDescription(file.description || '');
    setEditDialogOpen(true);
  };

  const handleAnalyzeClick = async (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file || file.file_type !== 'image') return;

    try {
      setAnalyzingFiles(prev => new Set(prev).add(file.id));
      // 메타데이터 생성 대기 목록에 추가
      setPendingAnalysisFiles(prev => new Set(prev).add(file.id));
      
      await analyzeImage(file.id);
      await loadFiles();
      
      // 분석 완료 후 대기 목록에서 제거
      setPendingAnalysisFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
      
      alert('이미지 분석이 완료되었습니다.');
    } catch (error: any) {
      console.error('이미지 분석 실패:', error);
      // 실패 시에도 대기 목록에서 제거
      setPendingAnalysisFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
      alert(error.message || '이미지 분석에 실패했습니다.');
    } finally {
      setAnalyzingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const handleEditConfirm = async () => {
    if (!fileToEdit) return;

    try {
      setEditing(true);
      await updateFile(fileToEdit.id, { description: editDescription.trim() });
      await loadFiles();
      setEditDialogOpen(false);
      setFileToEdit(null);
      setEditDescription('');
      alert('파일 정보가 수정되었습니다.');
    } catch (error) {
      console.error('파일 정보 수정 실패:', error);
      alert('파일 정보 수정에 실패했습니다.');
    } finally {
      setEditing(false);
    }
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
    const hasError = imageErrors.has(file.id);

    if (isImage && !hasError) {
      // 이미지 URL이 절대 URL인지 확인하고, 상대 경로인 경우 처리
      const imageUrl = file.file_path?.startsWith('http') 
        ? file.file_path 
        : file.file_path?.startsWith('/') 
          ? file.file_path 
          : `https://${file.file_path}`;

      return (
        <div className="relative w-full h-40 sm:h-48 bg-muted rounded-md overflow-hidden">
          <Image 
            src={imageUrl} 
            alt={file.file_name} 
            fill 
            className="object-cover" 
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={!imageUrl.includes('supabase.co')}
            onError={() => {
              console.error('이미지 로딩 실패:', imageUrl, file.id);
              setImageErrors(prev => new Set(prev).add(file.id));
            }}
          />
        </div>
      );
    }

    return (
      <div className="w-full h-40 sm:h-48 bg-muted rounded-md flex items-center justify-center">
        <FileIcon className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground" />
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
    return <div className="p-4 text-center text-muted-foreground text-sm">로딩 중...</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 sm:p-4">
        <div className="mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-semibold">공정별 파일</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">컷 {selectedCut.cut_number}의 제작 파일들</p>
        </div>

        <div className="space-y-4 sm:space-y-6">
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
                        <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 text-primary" />
                        <p className="text-sm sm:text-base text-primary font-medium">파일을 여기에 놓으세요</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <Card key={process.id}>
                <CardHeader className="p-3 sm:p-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: process.color }} />
                    <CardTitle className="text-sm sm:text-base">{process.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">{processFiles.length}개</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <ProcessDropzone>
                    {(open) => (
                      <>
                        {processUploadingFiles.length > 0 && (
                          <div className="mb-3 sm:mb-4 space-y-2 p-3 sm:p-4 bg-muted rounded-lg">
                            <p className="text-xs sm:text-sm font-medium mb-2">업로드 중...</p>
                            {processUploadingFiles.map((file: globalThis.File) => (
                              <div key={file.name} className="space-y-1">
                                <div className="flex items-center justify-between text-xs sm:text-sm">
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
                          <div className="py-8 sm:py-12 text-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
                            {profile && canUploadFile(profile.role) ? (
                              <>
                                <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-muted-foreground opacity-50" />
                                <p className="text-xs sm:text-sm text-muted-foreground mb-1">파일을 드래그하여 업로드</p>
                                <p className="text-xs text-muted-foreground">또는 클릭하여 파일 선택</p>
                              </>
                            ) : (
                              <>
                                <FileIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-muted-foreground opacity-50" />
                                <p className="text-xs sm:text-sm text-muted-foreground">파일이 없습니다</p>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                            {/* 업로드 버튼 카드 */}
                            {profile && canUploadFile(profile.role) && (
                              <Card 
                                className="overflow-hidden border-dashed opacity-40 hover:opacity-100 active:opacity-100 transition-opacity cursor-pointer group touch-manipulation p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  open();
                                }}
                              >
                                <div className="w-full h-40 sm:h-48 bg-muted/50 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground/30 group-hover:border-primary/50">
                                  <Plus className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="p-2 sm:p-3 text-center">
                                  <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">파일 추가</p>
                                </div>
                              </Card>
                            )}
                            {processFiles.map((file: FileType) => {
                              const metadata = file.metadata as {
                                scene_summary?: string;
                                tags?: string[];
                                characters_count?: number;
                              } | undefined;
                              const hasMetadata = metadata && metadata.scene_summary && metadata.tags;
                              const isAnalyzing = analyzingFiles.has(file.id);
                              const isPendingAnalysis = pendingAnalysisFiles.has(file.id);

                              return (
                                <Card 
                                  key={file.id} 
                                  className="overflow-hidden p-0 hover:shadow-md transition-all duration-200 ease-in-out cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFileToView(file);
                                    setDetailDialogOpen(true);
                                  }}
                                >
                                  {renderFilePreview(file)}
                                  <div className="p-2 sm:p-3">
                                    <p className="text-xs sm:text-sm font-medium truncate">{file.file_name}</p>
                                    {file.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                                    )}
                                    {hasMetadata && (
                                      <div className="mt-2 space-y-2">
                                        {metadata.scene_summary && (
                                          <p className="text-xs text-muted-foreground line-clamp-2">{metadata.scene_summary}</p>
                                        )}
                                        {metadata.tags && metadata.tags.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {metadata.tags.slice(0, 5).map((tag, idx) => (
                                              <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                                                {tag}
                                              </Badge>
                                            ))}
                                            {metadata.tags.length > 5 && (
                                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                +{metadata.tags.length - 5}
                                              </Badge>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {!hasMetadata && file.file_type === 'image' && (
                                      <div className="mt-1 flex items-center gap-1">
                                        {isPendingAnalysis ? (
                                          <>
                                            <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                                            <p className="text-xs text-muted-foreground">메타데이터 생성 중...</p>
                                          </>
                                        ) : (
                                          <p className="text-xs text-muted-foreground">메타데이터 없음</p>
                                        )}
                                      </div>
                                    )}
                                    <div className="flex gap-1.5 sm:gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                      <Button size="sm" variant="ghost" className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" onClick={(e) => handleDownload(file, e)}>
                                        <Download className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                      </Button>
                                      {file.file_type === 'image' && profile && canUploadFile(profile.role) && (
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" 
                                          onClick={(e) => handleAnalyzeClick(file, e)}
                                          disabled={isAnalyzing}
                                        >
                                          <Sparkles className={`h-3.5 w-3.5 sm:h-3 sm:w-3 ${isAnalyzing ? 'animate-pulse' : ''}`} />
                                        </Button>
                                      )}
                                      {profile && canUploadFile(profile.role) && (!file.description || file.description.trim() === '') && (
                                        <Button size="sm" variant="ghost" className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" onClick={(e) => handleEditClick(file, e)}>
                                          <Edit className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                        </Button>
                                      )}
                                      {profile && canDeleteFile(profile.role) && (
                                        <Button size="sm" variant="ghost" className="h-8 sm:h-7 px-2 flex-1 text-destructive hover:text-destructive touch-manipulation" onClick={(e) => handleDeleteClick(file, e)}>
                                          <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              );
                            })}
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

      {/* 파일 정보 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>파일 정보 수정</DialogTitle>
            <DialogDescription>파일 설명을 입력하세요. (AI 자동 생성 전까지 수정 가능)</DialogDescription>
          </DialogHeader>
          {fileToEdit && (
            <div className="py-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">파일명</p>
                <p className="text-sm text-muted-foreground">{fileToEdit.file_name}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  설명
                </label>
                <textarea
                  id="description"
                  className={cn(
                    "w-full min-h-[100px] px-3 py-2 text-sm border rounded-md resize-none",
                    "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
                    "bg-transparent shadow-xs transition-[color,box-shadow] outline-none",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="파일에 대한 설명을 입력하세요..."
                  disabled={editing}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setFileToEdit(null);
              setEditDescription('');
            }} disabled={editing}>
              취소
            </Button>
            <Button onClick={handleEditConfirm} disabled={editing}>
              {editing ? '수정 중...' : '수정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파일 상세 정보 Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] !top-[2.5vh] !left-[2.5vw] !translate-x-0 !translate-y-0 !sm:max-w-[95vw] overflow-y-auto p-6">
          {fileToView && (
            <>
              <DialogTitle asChild>
                <h2 className="text-xl font-semibold break-words mb-0">{fileToView.file_name}</h2>
              </DialogTitle>
              <div className="space-y-6">
              {/* 파일 미리보기 */}
              <div className="w-full">
                {fileToView.file_type === 'image' && !imageErrors.has(fileToView.id) ? (
                  <div className="relative w-full h-[60vh] min-h-[400px] bg-muted rounded-md overflow-hidden">
                    <Image 
                      src={fileToView.file_path?.startsWith('http') 
                        ? fileToView.file_path 
                        : fileToView.file_path?.startsWith('/') 
                          ? fileToView.file_path 
                          : `https://${fileToView.file_path}`} 
                      alt={fileToView.file_name} 
                      fill 
                      className="object-contain" 
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                      unoptimized={!fileToView.file_path?.includes('supabase.co')}
                      onError={() => {
                        console.error('이미지 로딩 실패:', fileToView.file_path);
                        setImageErrors(prev => new Set(prev).add(fileToView.id));
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-[60vh] min-h-[400px] bg-muted rounded-md flex items-center justify-center">
                    <div className="text-center">
                      <FileIcon className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                      {fileToView.file_type === 'image' && (
                        <p className="text-sm text-muted-foreground">이미지를 불러올 수 없습니다</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 기본 정보 및 메타데이터 */}
              <div className="flex flex-col md:flex-row gap-4">
                {/* 기본 정보 카드 */}
                <Card className="flex-1">
                  <CardHeader>
                    <CardTitle className="text-base">기본 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">파일명</span>
                      <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{fileToView.file_name}</span>
                    </div>
                    {fileToView.file_size && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          파일 크기
                        </span>
                        <span className="text-sm font-medium text-right flex-1 ml-4">
                          {(fileToView.file_size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    )}
                    {fileToView.mime_type && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground">MIME 타입</span>
                        <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{fileToView.mime_type}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        생성일
                      </span>
                      <span className="text-sm font-medium text-right flex-1 ml-4">
                        {format(new Date(fileToView.created_at), 'yyyy년 MM월 dd일 HH:mm')}
                      </span>
                    </div>
                    {fileToView.description && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">설명</p>
                        <p className="text-sm">{fileToView.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 메타데이터 카드 */}
                {fileToView.file_type === 'image' && (
                  <Card className="flex-1">
                    <CardHeader>
                      <CardTitle className="text-base">메타데이터</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const metadata = fileToView.metadata as {
                          scene_summary?: string;
                          tags?: string[];
                          characters_count?: number;
                          analyzed_at?: string;
                        } | undefined;
                        
                        if (metadata && metadata.scene_summary && metadata.tags) {
                          return (
                            <div className="space-y-3">
                              {metadata.scene_summary && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">장면 요약</p>
                                  <p className="text-sm">{metadata.scene_summary}</p>
                                </div>
                              )}
                              {metadata.tags && metadata.tags.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-2">태그</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {metadata.tags.map((tag, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {typeof metadata.characters_count === 'number' && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">등장 인물 수</p>
                                  <p className="text-sm">{metadata.characters_count}명</p>
                                </div>
                              )}
                              {metadata.analyzed_at && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">분석 일시</p>
                                  <p className="text-sm">
                                    {format(new Date(metadata.analyzed_at), 'yyyy년 MM월 dd일 HH:mm')}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Sparkles className="h-4 w-4" />
                              <span>메타데이터가 없습니다. 분석 버튼을 눌러 생성하세요.</span>
                            </div>
                          );
                        }
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(fileToView, e);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
                {fileToView.file_type === 'image' && profile && canUploadFile(profile.role) && (
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailDialogOpen(false);
                      handleAnalyzeClick(fileToView, e);
                    }}
                    disabled={analyzingFiles.has(fileToView.id)}
                  >
                    <Sparkles className={`h-4 w-4 mr-2 ${analyzingFiles.has(fileToView.id) ? 'animate-pulse' : ''}`} />
                    {analyzingFiles.has(fileToView.id) ? '분석 중...' : '분석'}
                  </Button>
                )}
                {profile && canDeleteFile(profile.role) && (
                  <Button 
                    variant="destructive" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailDialogOpen(false);
                      handleDeleteClick(fileToView, e);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </Button>
                )}
              </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}


