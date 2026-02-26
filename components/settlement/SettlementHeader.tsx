'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canManageAccounting } from '@/lib/utils/permissions';
import { MonthSelector } from './MonthSelector';
import { RevenueUploadForm } from './RevenueUploadForm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, HelpCircle } from 'lucide-react';

export function SettlementHeader() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      <h1 className="text-2xl md:text-3xl font-bold">RS 정산</h1>
      <div className="flex items-center gap-2">
        <Link href="/accounting/settlement/guide">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <HelpCircle className="h-4 w-4 mr-1" />
            서비스 설명서
          </Button>
        </Link>
        <MonthSelector />
        {profile && canManageAccounting(profile.role) && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1.5" />
                업로드
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
