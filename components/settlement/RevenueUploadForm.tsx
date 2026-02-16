'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { settlementFetch } from '@/lib/settlement/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { RevenueType } from '@/lib/types/settlement';

const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  domestic_paid: '국내유료수익',
  global_paid: '글로벌유료수익',
  domestic_ad: '국내광고',
  global_ad: '글로벌광고',
  secondary: '2차사업',
};

/**
 * 파일명에서 수익 유형 자동 감지
 */
function detectRevenueType(fileName: string): RevenueType | null {
  const name = fileName.toLowerCase();
  if (name.includes('super like') || name.includes('superlike')) return 'secondary';
  if (name.includes('매니지먼트') || name.includes('management')) return 'secondary';
  if (name.includes('kr webtoon ad') || name.includes('kr series ad') || name.includes('시리즈광고')) return 'domestic_ad';
  if (name.includes('정산리포트') && name.includes('광고')) return 'domestic_ad';
  if (name.includes('linewebtoon_ad') || name.includes('linewebtoon ad') || (name.includes('글로벌광고') || (name.includes('global') && name.includes('ad')))) return 'global_ad';
  if (name.includes('linewebtoon invoice') || name.includes('linewebtoon_invoice')) return 'global_paid';
  if (name.includes('국내유상이용권') || name.includes('국내유상')) return 'domestic_paid';
  return null;
}

interface UploadResult {
  matched: { work_name: string; work_id: string; amount: number }[];
  auto_created: { work_name: string; work_id: string; amount: number }[];
  total_amount: number;
  file_results?: { name: string; count: number; amount: number }[];
  errors: string[];
}

export function RevenueUploadForm({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const { selectedMonth } = useSettlementStore();
  const [revenueType, setRevenueType] = useState<RevenueType>('domestic_paid');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFiles(prev => [...prev, ...acceptedFiles]);
      setResult(null);
      setError(null);

      // 첫 파일에서 수익 유형 자동 감지
      const detected = detectRevenueType(acceptedFiles[0].name);
      if (detected) {
        setRevenueType(detected);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('month', selectedMonth);
      formData.append('revenue_type', revenueType);
      for (const file of files) {
        formData.append('files', file);
      }

      const res = await settlementFetch('/api/accounting/settlement/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '업로드 실패');
        return;
      }

      setResult(data);
      setFiles([]);
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
          <label className="text-sm font-medium mb-1 block">수익 유형 (파일명에서 자동 감지)</label>
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
        <p className="text-sm text-muted-foreground">
          엑셀 파일을 드래그하거나 클릭하여 선택하세요 (.xlsx, 복수 선택 가능)
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span className="truncate">{f.name}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeFile(i)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
        {uploading ? '업로드 중...' : `업로드 및 파싱 (${files.length}개 파일)`}
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
            {result.file_results && result.file_results.length > 1 && (
              <div>
                <p className="text-sm font-medium">파일별 결과</p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {result.file_results.map((f, i) => (
                    <li key={i}>{f.name}: {f.count}건, {f.amount.toLocaleString()}원</li>
                  ))}
                </ul>
              </div>
            )}
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
