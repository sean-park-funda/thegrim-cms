'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Play, Plus, Trash2, Loader2, Download,
  ChevronRight, RotateCcw, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import type { WebtoonAnimationCut, WebtoonAnimationVideoSegment } from '@/lib/supabase';

interface SegmentPlannerProps {
  cuts: WebtoonAnimationCut[];
  projectId: string;
  rangeStart: number;
  rangeEnd: number;
}

const DURATION_OPTIONS = [
  { value: 4, label: '4초' },
  { value: 6, label: '6초' },
  { value: 8, label: '8초' },
];

const STATUS_CONFIG = {
  pending: { icon: Clock, label: '대기', color: 'text-muted-foreground' },
  generating: { icon: Loader2, label: '생성중', color: 'text-blue-500', spin: true },
  completed: { icon: CheckCircle2, label: '완료', color: 'text-green-500' },
  failed: { icon: XCircle, label: '실패', color: 'text-destructive' },
} as const;

export function SegmentPlanner({ cuts, projectId, rangeStart, rangeEnd }: SegmentPlannerProps) {
  const [segments, setSegments] = useState<WebtoonAnimationVideoSegment[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [merging, setMerging] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(4);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const generatingRef = useRef<Set<string>>(new Set());

  const getCutByIndex = useCallback(
    (index: number) => cuts.find((c) => c.order_index === index),
    [cuts]
  );

  // 자동 세그먼트 생성
  const handleAutoGenerate = async () => {
    setAutoGenerating(true);
    try {
      const res = await fetch('/api/webtoonanimation/auto-segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          groupId,
          rangeStart,
          rangeEnd,
          durationSeconds,
          aspectRatio,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`세그먼트 생성 실패: ${err.error}`);
        return;
      }

      const data = await res.json();
      setGroupId(data.groupId);
      setSegments(data.segments || []);
    } catch (e) {
      console.error('세그먼트 생성 실패:', e);
      alert('세그먼트 생성 중 오류가 발생했습니다.');
    } finally {
      setAutoGenerating(false);
    }
  };

  // 세그먼트 추가
  const handleAddSegment = () => {
    if (!groupId) return;
    const lastSeg = segments[segments.length - 1];
    const newIndex = lastSeg ? lastSeg.segment_index + 1 : 0;
    const startIdx = lastSeg ? lastSeg.end_cut_index ?? lastSeg.start_cut_index + 1 : rangeStart;
    const endIdx = Math.min(startIdx + 1, rangeEnd);

    const tempSegment: WebtoonAnimationVideoSegment = {
      id: `temp-${Date.now()}`,
      group_id: groupId,
      segment_index: newIndex,
      start_cut_index: startIdx,
      end_cut_index: endIdx,
      prompt: '',
      api_provider: 'veo',
      duration_seconds: durationSeconds,
      aspect_ratio: aspectRatio,
      status: 'pending',
      video_path: null,
      video_url: null,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setSegments((prev) => [...prev, tempSegment]);
  };

  // 세그먼트 수정
  const handleUpdateSegment = useCallback(async (segmentId: string, field: string, value: unknown) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segmentId ? { ...s, [field]: value } : s))
    );

    if (segmentId.startsWith('temp-')) return;

    try {
      await fetch('/api/webtoonanimation/auto-segments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentId, [field]: value }),
      });
    } catch (e) {
      console.error('세그먼트 수정 실패:', e);
    }
  }, []);

  // 세그먼트 삭제
  const handleDeleteSegment = async (segmentId: string) => {
    if (segmentId.startsWith('temp-')) {
      setSegments((prev) => prev.filter((s) => s.id !== segmentId));
      return;
    }

    try {
      await fetch(`/api/webtoonanimation/auto-segments?segmentId=${segmentId}`, { method: 'DELETE' });
      setSegments((prev) => prev.filter((s) => s.id !== segmentId));
    } catch (e) {
      console.error('세그먼트 삭제 실패:', e);
    }
  };

  // 단일 세그먼트 영상 생성
  const handleGenerateVideo = async (segmentId: string) => {
    if (generatingRef.current.has(segmentId)) return;
    generatingRef.current.add(segmentId);

    setSegments((prev) =>
      prev.map((s) => (s.id === segmentId ? { ...s, status: 'generating' as const, error_message: null } : s))
    );

    try {
      const res = await fetch('/api/webtoonanimation/generate-segment-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentId }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSegments((prev) =>
          prev.map((s) =>
            s.id === segmentId ? { ...s, status: 'failed' as const, error_message: err.error } : s
          )
        );
        return;
      }

      const updated = await res.json();
      setSegments((prev) => prev.map((s) => (s.id === segmentId ? updated : s)));
    } catch (e) {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId
            ? { ...s, status: 'failed' as const, error_message: e instanceof Error ? e.message : '오류' }
            : s
        )
      );
    } finally {
      generatingRef.current.delete(segmentId);
    }
  };

  // 전체 생성
  const handleGenerateAll = async () => {
    const pendingSegments = segments.filter((s) => s.status === 'pending' || s.status === 'failed');
    for (const seg of pendingSegments) {
      await handleGenerateVideo(seg.id);
    }
  };

  // 합치기 & 다운로드
  const handleMerge = async () => {
    if (!groupId) return;
    setMerging(true);

    try {
      const res = await fetch('/api/webtoonanimation/merge-segment-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`합치기 실패: ${err.error}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('합치기 실패:', e);
      alert('영상 합치기 중 오류가 발생했습니다.');
    } finally {
      setMerging(false);
    }
  };

  const completedCount = segments.filter((s) => s.status === 'completed').length;
  const allCompleted = segments.length > 0 && completedCount === segments.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>세그먼트 영상 생성</span>
          <span className="text-xs text-muted-foreground font-normal">
            {segments.length > 0 && `${completedCount}/${segments.length} 완료`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 설정 + 자동 생성 */}
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">클립 길이</label>
            <div className="flex h-9 rounded-md border overflow-hidden">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDurationSeconds(opt.value)}
                  className={`px-3 text-xs font-medium transition-colors border-r last:border-r-0 ${
                    durationSeconds === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-accent text-muted-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">비율</label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="w-24 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9</SelectItem>
                <SelectItem value="9:16">9:16</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleAutoGenerate}
            disabled={autoGenerating || cuts.length < 2}
            className="h-9"
          >
            {autoGenerating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1.5" />
            )}
            {autoGenerating ? '세그먼트 생성 중...' : '자동 세그먼트 생성'}
          </Button>
        </div>

        {/* 세그먼트 목록 */}
        {segments.length > 0 && (
          <div className="space-y-2">
            {segments.map((seg) => {
              const startCut = getCutByIndex(seg.start_cut_index);
              const endCut = seg.end_cut_index !== null ? getCutByIndex(seg.end_cut_index) : null;
              const statusCfg = STATUS_CONFIG[seg.status];
              const StatusIcon = statusCfg.icon;

              return (
                <div
                  key={seg.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  {/* 헤더: 썸네일 + 상태 + 액션 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-6">
                      #{seg.segment_index}
                    </span>

                    {/* 시작 컷 썸네일 */}
                    <div className="flex items-center gap-1.5">
                      {startCut ? (
                        <img
                          src={startCut.file_path}
                          alt={`컷 ${seg.start_cut_index}`}
                          className="h-10 w-10 rounded object-cover border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs">
                          {seg.start_cut_index}
                        </div>
                      )}

                      <ChevronRight className="h-3 w-3 text-muted-foreground" />

                      {/* 끝 컷 썸네일 */}
                      {endCut ? (
                        <img
                          src={endCut.file_path}
                          alt={`컷 ${seg.end_cut_index}`}
                          className="h-10 w-10 rounded object-cover border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                          없음
                        </div>
                      )}
                    </div>

                    {/* 컷 인덱스 변경 */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="number"
                        value={seg.start_cut_index}
                        onChange={(e) => handleUpdateSegment(seg.id, 'start_cut_index', parseInt(e.target.value) || 0)}
                        className="w-10 h-7 text-center rounded border bg-background text-xs"
                        min={0}
                        max={rangeEnd}
                      />
                      <span>→</span>
                      <input
                        type="number"
                        value={seg.end_cut_index ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleUpdateSegment(seg.id, 'end_cut_index', v ? parseInt(v) : null);
                        }}
                        className="w-10 h-7 text-center rounded border bg-background text-xs"
                        min={0}
                        max={rangeEnd}
                        placeholder="-"
                      />
                    </div>

                    {/* 길이 선택 */}
                    <select
                      value={seg.duration_seconds}
                      onChange={(e) => handleUpdateSegment(seg.id, 'duration_seconds', parseInt(e.target.value))}
                      className="h-7 rounded border bg-background text-xs px-1"
                    >
                      {DURATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    {/* 상태 */}
                    <StatusIcon
                      className={`h-4 w-4 ${statusCfg.color} ${'spin' in statusCfg && statusCfg.spin ? 'animate-spin' : ''} ml-auto`}
                    />

                    {/* 액션 버튼 */}
                    {seg.status === 'pending' || seg.status === 'failed' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleGenerateVideo(seg.id)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        생성
                      </Button>
                    ) : seg.status === 'completed' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleGenerateVideo(seg.id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        재생성
                      </Button>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSegment(seg.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* 프롬프트 */}
                  <Textarea
                    value={seg.prompt}
                    onChange={(e) => handleUpdateSegment(seg.id, 'prompt', e.target.value)}
                    placeholder="영상 프롬프트 (영어, 1-2문장)"
                    className="text-xs min-h-[48px] resize-none font-mono"
                    rows={2}
                  />

                  {/* 에러 메시지 */}
                  {seg.error_message && (
                    <p className="text-xs text-destructive">{seg.error_message}</p>
                  )}

                  {/* 영상 미리보기 */}
                  {seg.status === 'completed' && seg.video_url && (
                    <video
                      src={seg.video_url}
                      controls
                      className="w-full max-h-48 rounded border"
                    />
                  )}
                </div>
              );
            })}

            {/* 세그먼트 추가 */}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs border-dashed"
              onClick={handleAddSegment}
            >
              <Plus className="h-3 w-3 mr-1" />
              세그먼트 추가
            </Button>
          </div>
        )}

        {/* 하단 액션 */}
        {segments.length > 0 && (
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAll}
              disabled={segments.every((s) => s.status === 'completed' || s.status === 'generating')}
            >
              <Play className="h-4 w-4 mr-1.5" />
              전체 생성
            </Button>

            <Button
              size="sm"
              onClick={handleMerge}
              disabled={!allCompleted || merging}
              className="ml-auto"
            >
              {merging ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              {merging ? '합치는 중...' : '합치기 & 다운로드'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
