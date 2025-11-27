'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';
import { uploadReferenceFile } from '@/lib/api/referenceFiles';
import { Process } from '@/lib/supabase';

interface ReferenceFileUploadProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    webtoonId: string;
    processes: Process[];
    onUploadComplete?: () => void;
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

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
    };

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
            await uploadReferenceFile(selectedFile, webtoonId, selectedProcessId, description);
            alert('레퍼런스 파일이 업로드되었습니다.');

            // 초기화
            setSelectedFile(null);
            setSelectedProcessId('');
            setDescription('');
            onOpenChange(false);
            onUploadComplete?.();
        } catch (error) {
            console.error('레퍼런스 파일 업로드 실패:', error);
            alert('레퍼런스 파일 업로드에 실패했습니다.');
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
