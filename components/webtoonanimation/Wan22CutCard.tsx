'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Sparkles, Copy, Check, Loader2, Film, Wand2, ImageIcon, Play,
} from 'lucide-react';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type FrameRole = 'start' | 'end' | 'middle';

const FRAME_ROLE_OPTIONS: { value: FrameRole; label: string }[] = [
  { value: 'start', label: '시작' },
  { value: 'end', label: '끝' },
  { value: 'middle', label: '중간 ref' },
];

const FRAME_STRATEGY_OPTIONS = [
  { value: 'enter', label: '등장' },
  { value: 'exit', label: '퇴장' },
  { value: 'expression', label: '표정변화' },
  { value: 'empty_to_action', label: '빈→액션' },
];

interface Props {
  cut: WebtoonAnimationCut;
  project: WebtoonAnimationProject | null;
  onCutUpdated: (updated: WebtoonAnimationCut) => void;
}

function CopyBtn({ text, id, copied, onCopy }: { text: string; id: string; copied: string | null; onCopy: (id: string, text: string) => void }) {
  return (
    <button onClick={() => onCopy(id, text)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0" title="복사">
      {copied === id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** 결과 없을 때 빈 박스 */
function EmptyResult({ label, ratio = '16:9' }: { label: string; ratio?: string }) {
  const cls = ratio === '9:16' ? 'aspect-[9/16]' : 'aspect-video';
  return (
    <div className={`w-full ${cls} border-2 border-dashed border-muted-foreground/20 rounded flex items-center justify-center`}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * 세로형 스텝 카드
 * 결과이미지 → EN 프롬프트 → KO 번역 → 수정지시 → 재생성 버튼
 */
function StepCard({
  stepNum, title, resultSlot, promptEn, promptKo, enField,
  copied, onCopy, onEnChange, onRefine, refining, actionSlot, disabled,
}: {
  stepNum: number; title: string;
  resultSlot: React.ReactNode;
  promptEn: string; promptKo: string; enField: string;
  copied: string | null; onCopy: (id: string, text: string) => void;
  onEnChange: (v: string) => void;
  onRefine: (instruction: string) => Promise<void>;
  refining: boolean;
  actionSlot: React.ReactNode;
  disabled?: boolean;
}) {
  const [instr, setInstr] = useState('');
  const handleRefine = async () => {
    if (!instr.trim()) return;
    await onRefine(instr);
    setInstr('');
  };

  return (
    <div className={cn('rounded-lg border bg-card flex flex-col overflow-hidden', disabled && 'opacity-40 pointer-events-none')}>
      {/* 헤더 */}
      <div className="px-3 py-1.5 bg-muted/30 border-b flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-bold text-muted-foreground">STEP {stepNum}</span>
        <span className="text-xs font-medium truncate">{title}</span>
      </div>
      {/* 결과 이미지/영상 */}
      <div className="p-2 bg-muted/10 shrink-0 border-b">
        {resultSlot}
      </div>
      {/* 프롬프트 + 컨트롤 */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* EN textarea */}
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground font-medium">English</span>
            <CopyBtn text={promptEn} id={`${enField}-en`} copied={copied} onCopy={onCopy} />
          </div>
          <Textarea
            value={promptEn}
            onChange={(e) => onEnChange(e.target.value)}
            placeholder="English prompt..."
            className="text-xs font-mono resize-none min-h-[80px]"
            rows={4}
          />
        </div>
        {/* KO — 읽기 전용 */}
        {promptKo && (
          <p className="text-[10px] text-blue-400/80 leading-relaxed">{promptKo}</p>
        )}
        {/* 수정 지시 */}
        <div className="flex gap-1.5">
          <Textarea
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            placeholder="수정 지시..."
            className="text-xs resize-none min-h-[32px] flex-1"
            rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
          />
          <Button
            onClick={handleRefine}
            disabled={refining || !instr.trim()}
            variant="outline" size="sm"
            className="shrink-0 h-8 w-8 p-0"
            title="AI로 프롬프트 수정"
          >
            {refining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          </Button>
        </div>
        {/* 재생성 버튼 */}
        <div className="mt-auto pt-1">
          {actionSlot}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function Wan22CutCard({ cut, project, onCutUpdated }: Props) {
  const [synopsis, setSynopsis] = useState(cut.cut_synopsis || '');
  const [frameRole, setFrameRole] = useState<FrameRole>((cut.frame_role as FrameRole) || 'end');
  const [frameStrategy, setFrameStrategy] = useState(cut.frame_strategy || '');
  const [useColorize, setUseColorize] = useState(cut.use_colorize !== false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>((cut.aspect_ratio as '16:9' | '9:16') || '16:9');

  const [colorizeEn, setColorizeEn] = useState(cut.gemini_colorize_prompt || '');
  const [colorizeKo, setColorizeKo] = useState(cut.gemini_colorize_prompt_ko || '');
  const [expandEn, setExpandEn] = useState(cut.gemini_expand_prompt || '');
  const [expandKo, setExpandKo] = useState(cut.gemini_expand_prompt_ko || '');
  const [otherEn, setOtherEn] = useState(cut.gemini_start_frame_prompt || '');
  const [otherKo, setOtherKo] = useState(cut.gemini_other_frame_prompt_ko || '');
  const [videoEn, setVideoEn] = useState(cut.video_prompt || '');
  const [videoKo, setVideoKo] = useState(cut.video_prompt_ko || '');

  const [colorUrl, setColorUrl] = useState<string | null>(cut.color_image_url || null);
  const [anchorUrl, setAnchorUrl] = useState<string | null>(
    (cut.frame_role === 'start' ? cut.start_frame_url : cut.end_frame_url) || null
  );
  const [otherUrl, setOtherUrl] = useState<string | null>(
    (cut.frame_role === 'start' ? cut.end_frame_url : cut.start_frame_url) || null
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(cut.comfyui_video_url || null);

  const [genPrompts, setGenPrompts] = useState(false);
  const [genColorize, setGenColorize] = useState(false);
  const [genAnchor, setGenAnchor] = useState(false);
  const [genOther, setGenOther] = useState(false);
  const [genVideo, setGenVideo] = useState(false);
  const [refiningType, setRefiningType] = useState<string | null>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback((field: string, value: string | boolean) => {
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(async () => {
      await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, field, value }),
      });
    }, 600);
  }, [cut.id]);

  const update = useCallback((patch: Partial<WebtoonAnimationCut>) => {
    onCutUpdated({ ...cut, ...patch });
  }, [cut, onCutUpdated]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleGeneratePrompts = async () => {
    if (!synopsis.trim()) return;
    setGenPrompts(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cut.id, cutSynopsis: synopsis,
          frameRole, frameStrategy: frameStrategy || undefined,
          useColorize, characterSettings: project?.character_settings || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const p = data.prompts;
      setColorizeEn(p.gemini_colorize || '');
      setColorizeKo(p.gemini_colorize_ko || '');
      setExpandEn(p.gemini_expand || '');
      setExpandKo(p.gemini_expand_ko || '');
      setOtherEn(p.gemini_other_frame || '');
      setOtherKo(p.gemini_other_frame_ko || '');
      setVideoEn(p.video_prompt || '');
      setVideoKo(p.video_prompt_ko || '');
      update({
        cut_synopsis: synopsis, frame_role: frameRole,
        frame_strategy: frameStrategy || null, use_colorize: useColorize,
        gemini_colorize_prompt: p.gemini_colorize || null,
        gemini_colorize_prompt_ko: p.gemini_colorize_ko || null,
        gemini_expand_prompt: p.gemini_expand || null,
        gemini_expand_prompt_ko: p.gemini_expand_ko || null,
        gemini_start_frame_prompt: p.gemini_other_frame || null,
        gemini_other_frame_prompt_ko: p.gemini_other_frame_ko || null,
        video_prompt: p.video_prompt || null,
        video_prompt_ko: p.video_prompt_ko || null,
      });
    } catch (e) { alert(`프롬프트 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenPrompts(false); }
  };

  const handleRefinePrompt = async (promptType: string, instruction: string, currentEn: string, currentKo: string) => {
    setRefiningType(promptType);
    try {
      const res = await fetch('/api/webtoonanimation/refine-frame-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, promptType, instruction, currentEn, currentKo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (promptType === 'colorize')    { setColorizeEn(data.prompt_en); setColorizeKo(data.prompt_ko); update({ gemini_colorize_prompt: data.prompt_en, gemini_colorize_prompt_ko: data.prompt_ko }); }
      if (promptType === 'expand')      { setExpandEn(data.prompt_en);   setExpandKo(data.prompt_ko);   update({ gemini_expand_prompt: data.prompt_en,    gemini_expand_prompt_ko: data.prompt_ko }); }
      if (promptType === 'other_frame') { setOtherEn(data.prompt_en);    setOtherKo(data.prompt_ko);    update({ gemini_start_frame_prompt: data.prompt_en, gemini_other_frame_prompt_ko: data.prompt_ko }); }
      if (promptType === 'video')       { setVideoEn(data.prompt_en);    setVideoKo(data.prompt_ko);    update({ video_prompt: data.prompt_en, video_prompt_ko: data.prompt_ko }); }
    } catch (e) { alert(`프롬프트 수정 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setRefiningType(null); }
  };

  const handleGenColorize = async () => {
    setGenColorize(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'colorize' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.color_image_url) { setColorUrl(data.color_image_url); update({ color_image_url: data.color_image_url }); }
    } catch (e) { alert(`컬러화 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenColorize(false); }
  };

  const handleGenAnchor = async () => {
    setGenAnchor(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'anchor' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.color_image_url) setColorUrl(data.color_image_url);
      const a = frameRole === 'start' ? data.start_frame_url : data.end_frame_url;
      if (a) setAnchorUrl(a);
      update({
        color_image_url: data.color_image_url || cut.color_image_url,
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) { alert(`앵커 프레임 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenAnchor(false); }
  };

  const handleGenOther = async () => {
    setGenOther(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'other' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const o = frameRole === 'start' ? data.end_frame_url : data.start_frame_url;
      if (o) setOtherUrl(o);
      update({
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) { alert(`나머지 프레임 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenOther(false); }
  };

  const handleGenVideo = async () => {
    setGenVideo(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-comfyui-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.polling) {
        const startTime = Date.now();
        while (Date.now() - startTime < 5 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 10000));
          const pollRes = await fetch(`/api/webtoonanimation/cuts/${cut.id}`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.comfyui_video_url) {
              setVideoUrl(pollData.comfyui_video_url);
              update({ comfyui_video_url: pollData.comfyui_video_url });
              return;
            }
          }
        }
        throw new Error('영상 생성 타임아웃 (5분)');
      } else {
        setVideoUrl(data.video_url);
        update({ comfyui_video_url: data.video_url });
      }
    } catch (e) { alert(`영상 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenVideo(false); }
  };

  const hasAnchor = !!anchorUrl;
  const hasOther = frameRole === 'middle' || !!otherUrl;
  const canVideo = frameRole === 'middle' ? !!anchorUrl : (!!anchorUrl && !!otherUrl);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">

      {/* ── 헤더: 원본 이미지(좌) + 연출설명(우) ── */}
      <div className="border-b bg-muted/10">
        <div className="grid grid-cols-[240px_1fr] divide-x">
          {/* 원본 이미지 */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground">CUT {cut.order_index + 1} 원본</p>
              {videoUrl && (
                <span className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                  <Play className="h-3 w-3" />영상 완료
                </span>
              )}
            </div>
            <img src={cut.file_path} alt="원본" className="w-full object-contain rounded border" />
          </div>
          {/* 연출 설명 */}
          <div className="p-3 flex flex-col gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">연출 설명</Label>
              <Textarea
                value={synopsis}
                onChange={(e) => { setSynopsis(e.target.value); save('cut_synopsis', e.target.value); }}
                placeholder="이 컷에서 일어나는 일을 설명해주세요"
                className="text-sm resize-none min-h-[80px]"
                rows={4}
              />
            </div>
            {/* 설정 행 */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">이 컷의 역할</Label>
                <div className="flex gap-1">
                  {FRAME_ROLE_OPTIONS.map((opt) => (
                    <button key={opt.value}
                      onClick={() => { setFrameRole(opt.value); save('frame_role', opt.value); }}
                      className={cn(
                        'text-xs py-1 px-2.5 rounded border transition-colors',
                        frameRole === opt.value
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-muted-foreground text-muted-foreground'
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">비율</Label>
                <div className="flex gap-1">
                  {(['16:9', '9:16'] as const).map((r) => (
                    <button key={r}
                      onClick={() => { setAspectRatio(r); save('aspect_ratio', r); }}
                      className={cn(
                        'text-xs py-1 px-2.5 rounded border transition-colors',
                        aspectRatio === r
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-muted-foreground text-muted-foreground'
                      )}
                    >{r}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">컬러화</Label>
                <div className="flex items-center gap-1.5 h-8">
                  <Switch checked={useColorize} onCheckedChange={(v) => { setUseColorize(v); save('use_colorize', v); }} />
                  <span className="text-xs text-muted-foreground">{useColorize ? 'ON' : 'OFF'}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">씬 유형</Label>
                <Select value={frameStrategy} onValueChange={(v) => { setFrameStrategy(v); save('frame_strategy', v); }}>
                  <SelectTrigger className="text-xs h-8 w-28">
                    <SelectValue placeholder="선택사항" />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAME_STRATEGY_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGeneratePrompts} disabled={genPrompts || !synopsis.trim()} size="sm" className="ml-auto">
                {genPrompts
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                  : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />전체 프롬프트 자동 생성</>}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 스텝 카드 — 가로 배열 ── */}
      <div className="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* STEP 1: 컬러화 */}
        {useColorize && (
          <StepCard
            stepNum={1} title="컬러화"
            resultSlot={
              colorUrl
                ? <img src={colorUrl} alt="컬러" className={cn('w-full rounded border object-cover', aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video')} />
                : <EmptyResult label="아직 생성 안됨" ratio={aspectRatio} />
            }
            promptEn={colorizeEn} promptKo={colorizeKo} enField="gemini_colorize_prompt"
            copied={copied} onCopy={handleCopy}
            onEnChange={(v) => { setColorizeEn(v); save('gemini_colorize_prompt', v); }}
            onRefine={(instr) => handleRefinePrompt('colorize', instr, colorizeEn, colorizeKo)}
            refining={refiningType === 'colorize'}
            actionSlot={
              <Button
                onClick={handleGenColorize}
                disabled={genColorize || !colorizeEn}
                variant={colorUrl ? 'outline' : 'default'}
                size="sm" className="w-full"
              >
                {genColorize
                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />생성 중...</>
                  : <><ImageIcon className="h-3 w-3 mr-1" />{colorUrl ? '재생성' : '생성'}</>}
              </Button>
            }
          />
        )}

        {/* STEP 2: 앵커 프레임 */}
        <StepCard
          stepNum={useColorize ? 2 : 1}
          title={`앵커 (${frameRole === 'start' ? '시작' : frameRole === 'end' ? '끝' : 'ref'}) ${aspectRatio}`}
          resultSlot={
            anchorUrl
              ? <img src={anchorUrl} alt="앵커" className={cn('w-full rounded border object-cover', aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video')} />
              : <EmptyResult label="아직 생성 안됨" ratio={aspectRatio} />
          }
          promptEn={expandEn} promptKo={expandKo} enField="gemini_expand_prompt"
          copied={copied} onCopy={handleCopy}
          onEnChange={(v) => { setExpandEn(v); save('gemini_expand_prompt', v); }}
          onRefine={(instr) => handleRefinePrompt('expand', instr, expandEn, expandKo)}
          refining={refiningType === 'expand'}
          actionSlot={
            <Button
              onClick={handleGenAnchor}
              disabled={genAnchor || !expandEn}
              variant={hasAnchor ? 'outline' : 'default'}
              size="sm" className="w-full"
            >
              {genAnchor
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />생성 중...</>
                : <><ImageIcon className="h-3 w-3 mr-1" />{hasAnchor ? '재생성' : '생성'}</>}
            </Button>
          }
        />

        {/* STEP 3: 나머지 프레임 */}
        {frameRole !== 'middle' && (
          <StepCard
            stepNum={useColorize ? 3 : 2}
            title={`${frameRole === 'start' ? '끝' : '시작'} 프레임`}
            disabled={!hasAnchor}
            resultSlot={
              otherUrl
                ? <img src={otherUrl} alt="나머지" className={cn('w-full rounded border object-cover', aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video')} />
                : <EmptyResult label={hasAnchor ? '아직 생성 안됨' : '앵커 먼저'} ratio={aspectRatio} />
            }
            promptEn={otherEn} promptKo={otherKo} enField="gemini_start_frame_prompt"
            copied={copied} onCopy={handleCopy}
            onEnChange={(v) => { setOtherEn(v); save('gemini_start_frame_prompt', v); }}
            onRefine={(instr) => handleRefinePrompt('other_frame', instr, otherEn, otherKo)}
            refining={refiningType === 'other_frame'}
            actionSlot={
              <Button
                onClick={handleGenOther}
                disabled={genOther || !hasAnchor || !otherEn}
                variant={hasOther ? 'outline' : 'default'}
                size="sm" className="w-full"
              >
                {genOther
                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />생성 중...</>
                  : <><ImageIcon className="h-3 w-3 mr-1" />{hasOther ? '재생성' : '생성'}</>}
              </Button>
            }
          />
        )}

        {/* STEP 4: 영상 */}
        <StepCard
          stepNum={frameRole === 'middle' ? (useColorize ? 3 : 2) : (useColorize ? 4 : 3)}
          title="영상 (Wan 2.2)"
          disabled={!canVideo}
          resultSlot={
            videoUrl
              ? (
                <div className="w-full space-y-1">
                  <video src={videoUrl} controls className="w-full rounded border" style={{ aspectRatio: aspectRatio === '9:16' ? '9/16' : '832/480' }} />
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline block text-center">새 탭</a>
                </div>
              )
              : <EmptyResult label={canVideo ? '아직 생성 안됨' : '프레임 먼저'} ratio={aspectRatio} />
          }
          promptEn={videoEn} promptKo={videoKo} enField="video_prompt"
          copied={copied} onCopy={handleCopy}
          onEnChange={(v) => { setVideoEn(v); save('video_prompt', v); }}
          onRefine={(instr) => handleRefinePrompt('video', instr, videoEn, videoKo)}
          refining={refiningType === 'video'}
          actionSlot={
            <Button
              onClick={handleGenVideo}
              disabled={genVideo || !canVideo || !videoEn}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              size="sm"
            >
              {genVideo
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />렌더링 중...</>
                : <><Film className="h-3 w-3 mr-1" />{videoUrl ? '재생성' : '영상 생성'}</>}
            </Button>
          }
        />

      </div>
    </div>
  );
}
