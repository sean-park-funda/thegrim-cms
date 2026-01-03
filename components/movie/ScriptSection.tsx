'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Check } from 'lucide-react';

interface ScriptSectionProps {
  title: string;
  script: string;
  saving: boolean;
  disabled?: boolean;
  onTitleChange: (title: string) => void;
  onScriptChange: (script: string) => void;
  onSave: () => void;
}

export function ScriptSection({
  title,
  script,
  saving,
  disabled = false,
  onTitleChange,
  onScriptChange,
  onSave,
}: ScriptSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">대본</CardTitle>
        <CardDescription className="text-xs">
          영화 영상으로 만들 대본을 입력하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">제목 (선택)</label>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="프로젝트 제목"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">대본 *</label>
          <Textarea
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            placeholder="대본을 입력하세요...

예시:
[장면 1: 도시의 밤거리]
주인공이 비오는 거리를 걷고 있다.

[장면 2: 카페 내부]
주인공: '오랜만이야.'
상대방: '그러게, 정말 오랜만이다.'"
            className="min-h-[200px] resize-none"
            disabled={disabled}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving || !script.trim() || disabled} size="sm">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                저장
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
