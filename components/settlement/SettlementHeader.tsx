'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canManageAccounting } from '@/lib/utils/permissions';
import { MonthSelector } from './MonthSelector';
import { RevenueUploadForm } from './RevenueUploadForm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload } from 'lucide-react';

export function SettlementHeader() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold">RS 정산</h1>
      <div className="flex items-center gap-2">
        <MonthSelector />
        {profile && canManageAccounting(profile.role) && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1.5" />
                업로드
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>매출 엑셀 업로드 — {selectedMonth}</DialogTitle>
              </DialogHeader>
              <RevenueUploadForm />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
