'use client';

import { File as FileType } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface FileDeleteDialogProps {
  file: FileType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function FileDeleteDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: FileDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>파일 삭제</DialogTitle>
          <DialogDescription>정말로 이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</DialogDescription>
        </DialogHeader>
        {file && (
          <div className="py-4">
            <p className="text-sm font-medium">{file.file_name}</p>
            {file.description && (
              <p className="text-sm text-muted-foreground mt-1">{file.description}</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            취소
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? '삭제 중...' : '삭제'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

