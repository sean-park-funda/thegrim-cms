'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';
import { uploadReferenceFile } from '@/lib/api/referenceFiles';
import { Process, ReferenceFile } from '@/lib/supabase';

interface ReferenceFileUploadProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    webtoonId: string;
    processes: Process[];
    onUploadComplete?: (uploadedFile?: ReferenceFile) => void;
}

export function ReferenceFileUpload({
    open,
    onOpenChange,
    webtoonId,
    processes,
    onUploadComplete
}: ReferenceFileUploadProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedProcessId, setSelectedProcessId] = useState<string>('');
    const [description, setDescription] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isProcessingPaste = useRef(false);

    const handleFileSelect = useCallback((file: File) => {
        setSelectedFile(file);
    }, []);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile || !selectedProcessId) {
            alert('파일과 공정을 선택해주세요.');
            return;
        }

        try {
            setUploading(true);

            // File -> base64 데이터 URL 변환
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(selectedFile);
            });

            const [header, base64] = dataUrl.split(',');
            const mimeMatch = header.match(/^data:(.*);base64$/);
            const mimeType = mimeMatch?.[1] || selectedFile.type || 'application/octet-stream';

            console.log('[ReferenceFileUpload][handleUpload] 레퍼런스 파일 업로드 시작 - API로 업로드', {
                webtoonId,
                processId: selectedProcessId,
                fileName: selectedFile.name,
                fileSize: selectedFile.size,
                fileType: selectedFile.type,
            });

            // API를 통해 업로드 (Supabase Storage 네트워크 이슈 회피)
            const response = await fetch('/api/reference-files/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    imageData: base64,
                    mimeType,
                    fileName: selectedFile.name,
                    webtoonId,
                    processId: selectedProcessId,
                    description: description || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                console.error('[ReferenceFileUpload][handleUpload] 레퍼런스 파일 업로드 API 실패', {
                    status: response.status,
                    error: errorData,
                });
                throw new Error(errorData?.error || '레퍼런스 파일 업로드에 실패했습니다.');
            }

            const result = await response.json();
            console.log('[ReferenceFileUpload][handleUpload] 레퍼런스 파일 업로드 API 성공', {
                fileId: result.file?.id,
            });

            alert('레퍼런스 파일이 업로드되었습니다.');

            // 초기화
            setSelectedFile(null);
            setSelectedProcessId('');
            setDescription('');
            onOpenChange(false);
            onUploadComplete?.(result.file);
        } catch (error) {
            console.error('레퍼런스 파일 업로드 실패:', error);
            alert(error instanceof Error ? error.message : '레퍼런스 파일 업로드에 실패했습니다.');
        } finally {
            setUploading(false);
        }
    };

    const handleCancel = () => {
        setSelectedFile(null);
        setSelectedProcessId('');
        setDescription('');
        onOpenChange(false);
    };

    // 클립보드에서 이미지 붙여넣기 처리
    const handlePasteFromClipboard = useCallback(async (e: ClipboardEvent) => {
        // Dialog가 닫혀있으면 무시
        if (!open) {
            return;
        }

        // Dialog가 열려있으면 즉시 이벤트 전파 중단 (FileGrid로 전파 방지)
        // 조건을 확인하기 전에 먼저 이벤트 전파를 막아야 함
        e.stopPropagation();

        // 이미 처리 중이면 무시 (중복 방지)
        if (isProcessingPaste.current) {
            e.preventDefault();
            return;
        }

        // 입력 필드에 포커스가 있으면 기본 동작 허용 (하지만 이벤트 전파는 막음)
        const activeElement = document.activeElement;
        if (
            activeElement &&
            (activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.getAttribute('contenteditable') === 'true')
        ) {
            // 입력 필드에 포커스가 있으면 FileGrid로 전파되지 않도록 막음
            e.stopPropagation();
            return;
        }

        const clipboardData = e.clipboardData;
        if (!clipboardData) {
            // 다이얼로그가 열려있으면 이벤트 전파는 막음
            e.stopPropagation();
            return;
        }

        // 클립보드에서 이미지 찾기
        const items = Array.from(clipboardData.items);
        const imageItem = items.find((item) => item.type.indexOf('image') !== -1);

        if (!imageItem) {
            // 이미지가 아니면 무시 (하지만 다이얼로그가 열려있으면 이벤트 전파는 막음)
            e.stopPropagation();
            return;
        }

        // 이미지를 찾았으면 즉시 이벤트 전파 중단 (다른 핸들러가 실행되지 않도록)
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 처리 중 플래그 설정
        isProcessingPaste.current = true;

        try {
            // Blob으로 변환
            const blob = imageItem.getAsFile();
            if (!blob) {
                return;
            }

            // File 객체로 변환 (파일명은 타임스탬프 기반)
            const timestamp = Date.now();
            const fileExtension = blob.type.split('/')[1] || 'png';
            const fileName = `clipboard-${timestamp}.${fileExtension}`;
            const file = new File([blob], fileName, { type: blob.type });

            // 파일 선택 상태 업데이트
            handleFileSelect(file);
        } catch (error) {
            console.error('클립보드 이미지 붙여넣기 실패:', error);
            alert('클립보드 이미지 붙여넣기에 실패했습니다.');
        } finally {
            // 처리 완료 후 플래그 해제
            setTimeout(() => {
                isProcessingPaste.current = false;
            }, 500);
        }
    }, [open, handleFileSelect]);

    // 클립보드 붙여넣기 이벤트 리스너 등록
    useEffect(() => {
        if (!open) {
            return;
        }

        window.addEventListener('paste', handlePasteFromClipboard, true);

        return () => {
            window.removeEventListener('paste', handlePasteFromClipboard, true);
        };
    }, [open, handlePasteFromClipboard]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>레퍼런스 파일 업로드</DialogTitle>
                    <DialogDescription>
                        웹툰의 레퍼런스 파일을 업로드하고 공정을 선택하세요.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* 파일 선택 영역 */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">파일 선택 *</label>
                        <div
                            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragActive
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={handleFileInputChange}
                                accept="image/*,video/*,.psd,.ai,.pdf"
                            />
                            {selectedFile ? (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Upload className="h-5 w-5 text-primary" />
                                        <div className="text-left">
                                            <p className="text-sm font-medium">{selectedFile.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedFile(null);
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div>
                                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">
                                        파일을 드래그하거나 클릭하여 선택하세요
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        이미지, 비디오, PSD, AI, PDF 파일 지원
                                    </p>
                                    <p className="text-xs text-muted-foreground/70 mt-1">
                                        또는 Ctrl+V로 클립보드 붙여넣기 (이미지만)
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 공정 선택 */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">공정 선택 *</label>
                        <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                            <SelectTrigger>
                                <SelectValue placeholder="공정을 선택하세요" />
                            </SelectTrigger>
                            <SelectContent>
                                {processes.map((process) => (
                                    <SelectItem key={process.id} value={process.id}>
                                        {process.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 설명 입력 */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">설명</label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="파일 설명을 입력하세요 (선택사항)"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel} disabled={uploading}>
                        취소
                    </Button>
                    <Button onClick={handleUpload} disabled={uploading || !selectedFile || !selectedProcessId}>
                        {uploading ? '업로드 중...' : '업로드'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
