'use client';

import { File as FileType } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileEditDialogProps {
  file: FileType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (description: string) => void;
  editing: boolean;
  description: string;
  onDescriptionChange: (description: string) => void;
}

export function FileEditDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
  editing,
  description,
  onDescriptionChange,
}: FileEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>파일 정보 수정</DialogTitle>
          <DialogDescription>파일 설명을 입력하세요. (AI 자동 생성 전까지 수정 가능)</DialogDescription>
        </DialogHeader>
        {file && (
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">파일명</p>
              <p className="text-sm text-muted-foreground">{file.file_name}</p>
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
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="파일에 대한 설명을 입력하세요..."
                disabled={editing}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
          }} disabled={editing}>
            취소
          </Button>
          <Button onClick={() => onConfirm(description)} disabled={editing}>
            {editing ? '수정 중...' : '수정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

