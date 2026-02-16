'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { RevenueType } from '@/lib/types/settlement';

const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  domestic_paid: '국내유료수익',
  global_paid: '글로벌유료수익',
  domestic_ad: '국내광고',
  global_ad: '글로벌광고',
  secondary: '2차사업',
};

interface UploadResult {
  matched: { work_name: string; work_id: string; amount: number }[];
  auto_created: { work_name: string; work_id: string; amount: number }[];
  total_amount: number;
  errors: string[];
}

export function RevenueUploadForm({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const { selectedMonth } = useSettlementStore();
  const [revenueType, setRevenueType] = useState<RevenueType>('domestic_paid');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResult(null);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('month', selectedMonth);
      formData.append('revenue_type', revenueType);
      formData.append('file', file);

      const res = await fetch('/api/accounting/settlement/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '업로드 실패');
        return;
      }

      setResult(data);
      setFile(null);
      onUploadComplete?.();
    } catch {
      setError('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">수익 유형</label>
          <Select value={revenueType} onValueChange={(v) => setRevenueType(v as RevenueType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REVENUE_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="text-sm">{file.name}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            엑셀 파일을 드래그하거나 클릭하여 선택하세요 (.xlsx)
          </p>
        )}
      </div>

      <Button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? '업로드 중...' : '업로드 및 파싱'}
      </Button>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <span className="text-sm text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              업로드 결과
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              총 금액: <span className="font-semibold">{result.total_amount.toLocaleString()}원</span>
            </p>
            {result.matched.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-600">매칭됨 ({result.matched.length}건)</p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {result.matched.map((m, i) => (
                    <li key={i}>{m.work_name}: {m.amount.toLocaleString()}원</li>
                  ))}
                </ul>
              </div>
            )}
            {result.auto_created.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-600">자동 등록됨 ({result.auto_created.length}건)</p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {result.auto_created.map((m, i) => (
                    <li key={i}>{m.work_name}: {m.amount.toLocaleString()}원</li>
                  ))}
                </ul>
              </div>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive">오류</p>
                <ul className="text-xs text-destructive mt-1 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
