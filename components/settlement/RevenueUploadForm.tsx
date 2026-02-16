'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { settlementFetch } from '@/lib/settlement/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { RevenueType } from '@/lib/types/settlement';

interface UploadHistoryItem {
  file_name: string;
  total_amount: number;
  matched_count: number;
  created_at: string;
}

const REVENUE_TYPE_CONFIG: Record<RevenueType, { label: string; description: string; color: string }> = {
  domestic_paid: { label: '국내유료수익', description: '국내유상이용권 정산 파일', color: 'blue' },
  global_paid: { label: '글로벌유료수익', description: 'LINE Webtoon Invoice 파일', color: 'emerald' },
  domestic_ad: { label: '국내광고', description: 'KR Webtoon/Series AD 정산리포트', color: 'amber' },
  global_ad: { label: '글로벌광고', description: 'LINE Webtoon AD Invoice 파일', color: 'purple' },
  secondary: { label: '2차사업', description: 'Super Like, 매니지먼트 등', color: 'rose' },
};

interface UploadResult {
  matched: { work_name: string; work_id: string; amount: number }[];
  auto_created: { work_name: string; work_id: string; amount: number }[];
  total_amount: number;
  file_results?: { name: string; count: number; amount: number }[];
  errors: string[];
}

function RevenueTypeCard({ revenueType, history, onUploadComplete }: { revenueType: RevenueType; history: UploadHistoryItem[]; onUploadComplete?: () => void }) {
  const { selectedMonth } = useSettlementStore();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = REVENUE_TYPE_CONFIG[revenueType];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFiles(prev => [...prev, ...acceptedFiles]);
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

  const colorMap: Record<string, string> = {
    blue: 'border-l-blue-500',
    emerald: 'border-l-emerald-500',
    amber: 'border-l-amber-500',
    purple: 'border-l-purple-500',
    rose: 'border-l-rose-500',
  };

  const badgeColorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  };

  return (
    <Card className={`border-l-4 ${colorMap[config.color]}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{config.label}</CardTitle>
          {result && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColorMap[config.color]}`}>
              {result.total_amount.toLocaleString()}원
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">
            파일을 드래그하거나 클릭 (.xlsx)
          </p>
        </div>

        {history.length > 0 && !result && (
          <div className="space-y-0.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                <span className="truncate" title={h.file_name}>{h.file_name}</span>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{f.name}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeFile(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button size="sm" className="w-full" onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> 업로드 중...</>
              ) : (
                `업로드 (${files.length}개 파일)`
              )}
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-medium">업로드 완료</span>
            </div>
            {result.file_results && result.file_results.length > 1 && (
              <ul className="text-muted-foreground space-y-0.5 pl-5">
                {result.file_results.map((f, i) => (
                  <li key={i}>{f.name}: {f.count}건, {f.amount.toLocaleString()}원</li>
                ))}
              </ul>
            )}
            {result.matched.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-green-600 font-medium">
                  매칭 {result.matched.length}건
                </summary>
                <ul className="text-muted-foreground mt-1 space-y-0.5 pl-5">
                  {result.matched.map((m, i) => (
                    <li key={i}>{m.work_name}: {m.amount.toLocaleString()}원</li>
                  ))}
                </ul>
              </details>
            )}
            {result.auto_created.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-blue-600 font-medium">
                  자동 등록 {result.auto_created.length}건
                </summary>
                <ul className="text-muted-foreground mt-1 space-y-0.5 pl-5">
                  {result.auto_created.map((m, i) => (
                    <li key={i}>{m.work_name}: {m.amount.toLocaleString()}원</li>
                  ))}
                </ul>
              </details>
            )}
            {result.errors.length > 0 && (
              <details className="group" open>
                <summary className="cursor-pointer text-destructive font-medium">
                  오류 {result.errors.length}건
                </summary>
                <ul className="text-destructive mt-1 space-y-0.5 pl-5">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const REVENUE_TYPES: RevenueType[] = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'];

export function RevenueUploadForm({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const { selectedMonth } = useSettlementStore();
  const [historyMap, setHistoryMap] = useState<Record<string, UploadHistoryItem[]>>({});

  const loadHistory = useCallback(async () => {
    try {
      const res = await settlementFetch(`/api/accounting/settlement/upload?month=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, UploadHistoryItem[]> = {};
        for (const h of data.history || []) {
          if (!map[h.revenue_type]) map[h.revenue_type] = [];
          map[h.revenue_type].push(h);
        }
        setHistoryMap(map);
      }
    } catch {}
  }, [selectedMonth]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleUploadComplete = () => {
    loadHistory();
    onUploadComplete?.();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {REVENUE_TYPES.map((type) => (
        <RevenueTypeCard
          key={type}
          revenueType={type}
          history={historyMap[type] || []}
          onUploadComplete={handleUploadComplete}
        />
      ))}
    </div>
  );
}
