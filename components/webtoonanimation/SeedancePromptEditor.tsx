'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, Wand2, Loader2, Package, ChevronDown, ChevronRight } from 'lucide-react';
import {
  WebtoonAnimationPromptGroupWithCuts,
  WebtoonAnimationCut,
} from '@/lib/supabase';

interface SeedancePromptEditorProps {
  group: WebtoonAnimationPromptGroupWithCuts;
  cuts: WebtoonAnimationCut[];
  projectId: string;
  onUpdateGroup: (groupId: string, field: string, value: string | number) => void;
  onRefineSeedancePrompt: (instruction: string) => Promise<void>;
}

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

export function SeedancePromptEditor({
  group,
  cuts,
  projectId,
  onUpdateGroup,
  onRefineSeedancePrompt,
}: SeedancePromptEditorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refineInput, setRefineInput] = useState('');
  const [refining, setRefining] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showCutRef, setShowCutRef] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const prompts = group.cut_prompts || [];
  const seedancePrompt = group.seedance_prompt || '';

  const handleSeedancePromptChange = useCallback((value: string) => {
    onUpdateGroup(group.id, 'seedance_prompt', value);
  }, [group.id, onUpdateGroup]);

  const handleRefine = async () => {
    const instruction = refineInput.trim();
    if (!instruction) return;
    setRefining(true);
    try {
      await onRefineSeedancePrompt(instruction);
      setRefineInput('');
    } finally {
      setRefining(false);
    }
  };

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/webtoonanimation/export-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id, projectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`내보내기 실패: ${err.error}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `output-${Date.now()}.zip`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('내보내기 실패:', e);
      alert('프롬프트 내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  }, [group.id, projectId]);

  const getCutThumbnail = (cutIndex: number) => {
    const realIndex = group.range_start + cutIndex;
    const cut = cuts.find((c) => c.order_index === realIndex);
    return cut?.file_path;
  };

  return (
    <div className="space-y-4">
      {/* Seedance 프롬프트 메인 에디터 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm">
              Seedance 프롬프트 (컷 {group.range_start}~{group.range_end}, {group.video_duration || 10}초)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">비율</Label>
              <Select
                value={group.aspect_ratio}
                onValueChange={(v) => onUpdateGroup(group.id, 'aspect_ratio', v)}
              >
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* 프롬프트 텍스트 영역 */}
          <Textarea
            value={seedancePrompt}
            onChange={(e) => handleSeedancePromptChange(e.target.value)}
            className="min-h-[300px] text-sm font-mono resize-y"
            placeholder="Seedance 2.0 프롬프트가 여기에 생성됩니다..."
          />

          {/* AI 수정 */}
          <div className="flex gap-1.5">
            <Input
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRefine(); }}
              className="h-9 text-sm"
              placeholder="AI 수정 지시 (예: 카메라 움직임 더 역동적으로, 속도감 올려줘)"
              disabled={refining}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 flex-shrink-0"
              onClick={handleRefine}
              disabled={refining || !refineInput.trim()}
            >
              {refining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* 하단 액션 바 */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <div className="text-sm tabular-nums text-muted-foreground">
              {prompts.length}컷 · {group.video_duration || 10}초
            </div>

            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(seedancePrompt, 'seedance')}>
                {copiedId === 'seedance' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                프롬프트 복사
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Package className="h-3.5 w-3.5 mr-1.5" />
                )}
                {exporting ? '생성 중...' : '이미지+프롬프트 내보내기'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 컷별 참고 정보 (접이식) */}
      {prompts.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              onClick={() => setShowCutRef(!showCutRef)}
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full text-left"
            >
              {showCutRef ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              컷별 참고 정보 ({prompts.length}컷)
            </button>
          </CardHeader>
          {showCutRef && (
            <CardContent className="pt-3 space-y-3">
              {prompts.map((prompt, i) => {
                const thumbnail = getCutThumbnail(prompt.cut_index);
                return (
                  <div key={prompt.id} className="flex gap-3 p-2 rounded border bg-muted/30">
                    <div className="flex-shrink-0">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={`Cut ${group.range_start + prompt.cut_index}`}
                          className="w-16 h-16 object-cover rounded border"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-muted rounded border flex items-center justify-center text-[10px] text-muted-foreground">
                          No img
                        </div>
                      )}
                      <div className="text-center text-[10px] font-mono mt-0.5 text-muted-foreground">
                        @Image{i + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 text-xs space-y-1">
                      <div className="font-medium text-foreground">컷 {group.range_start + prompt.cut_index}</div>
                      <p className="text-muted-foreground line-clamp-2">{prompt.prompt}</p>
                      <div className="flex gap-3 text-muted-foreground">
                        {prompt.camera && <span>📷 {prompt.camera}</span>}
                        <span>⏱ {prompt.duration}초</span>
                        <span>{prompt.continuity === 'new scene' ? '🆕 새 장면' : '🔗 연결'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
