'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { AiRegenerationStyle, AiRegenerationStyleInput, ApiProvider } from '@/lib/supabase';
import { createStyle, updateStyle, getStyleGroups } from '@/lib/api/aiStyles';

interface StyleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style: AiRegenerationStyle | null; // null이면 새로 생성
  onComplete: () => void;
}

export function StyleEditDialog({
  open,
  onOpenChange,
  style,
  onComplete,
}: StyleEditDialogProps) {
  const isEditing = !!style;

  const [formData, setFormData] = useState<AiRegenerationStyleInput>({
    name: '',
    style_key: '',
    prompt: '',
    default_count: 2,
    allow_multiple: true,
    api_provider: 'auto',
    requires_reference: null,
    group_name: null,
  });

  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [useNewGroup, setUseNewGroup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // 스타일 데이터 초기화
  useEffect(() => {
    if (open) {
      if (style) {
        setFormData({
          name: style.name,
          style_key: style.style_key,
          prompt: style.prompt,
          default_count: style.default_count,
          allow_multiple: style.allow_multiple,
          api_provider: style.api_provider,
          requires_reference: style.requires_reference,
          group_name: style.group_name,
        });
        setUseNewGroup(false);
        setNewGroup('');
      } else {
        setFormData({
          name: '',
          style_key: '',
          prompt: '',
          default_count: 2,
          allow_multiple: true,
          api_provider: 'auto',
          requires_reference: null,
          group_name: null,
        });
        setUseNewGroup(false);
        setNewGroup('');
      }
    }
  }, [open, style]);

  // 그룹 목록 로드
  useEffect(() => {
    if (open) {
      setLoadingGroups(true);
      getStyleGroups()
        .then(setExistingGroups)
        .catch(console.error)
        .finally(() => setLoadingGroups(false));
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!formData.name.trim()) {
      alert('스타일 이름을 입력해주세요.');
      return;
    }
    if (!formData.style_key.trim()) {
      alert('스타일 키를 입력해주세요.');
      return;
    }
    if (!formData.prompt.trim()) {
      alert('기본 프롬프트를 입력해주세요.');
      return;
    }

    // 그룹 설정
    const finalGroupName = useNewGroup && newGroup.trim()
      ? newGroup.trim()
      : formData.group_name;

    setLoading(true);
    try {
      if (isEditing && style) {
        await updateStyle(style.id, {
          ...formData,
          group_name: finalGroupName,
        });
      } else {
        await createStyle({
          ...formData,
          group_name: finalGroupName,
        });
      }
      onComplete();
    } catch (error: unknown) {
      console.error('스타일 저장 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '스타일 저장에 실패했습니다.';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyChange = (value: string) => {
    // 스타일 키는 영문 소문자, 숫자, 하이픈만 허용
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    setFormData(prev => ({ ...prev, style_key: sanitized }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? '스타일 수정' : '새 스타일 추가'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? '스타일 설정을 수정합니다.'
              : '새로운 AI 다시그리기 스타일을 추가합니다.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* 스타일 이름 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">스타일 이름 *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="예: 극적 명암"
            />
          </div>

          {/* 스타일 키 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">스타일 키 *</label>
            <Input
              value={formData.style_key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="예: dramatic-shading"
              disabled={isEditing} // 수정 시 키 변경 불가
            />
            <p className="text-xs text-muted-foreground">
              영문 소문자, 숫자, 하이픈만 사용 가능합니다.
            </p>
          </div>

          {/* 기본 프롬프트 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">기본 프롬프트 *</label>
            <textarea
              value={formData.prompt}
              onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
              className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="이미지를 재생성할 때 사용할 기본 프롬프트를 입력하세요."
            />
          </div>

          {/* 그룹 선택 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">그룹</label>
            <div className="space-y-2">
              <Select
                value={useNewGroup ? '__new__' : (formData.group_name || '__none__')}
                onValueChange={(value) => {
                  if (value === '__new__') {
                    setUseNewGroup(true);
                    setFormData(prev => ({ ...prev, group_name: null }));
                  } else if (value === '__none__') {
                    setUseNewGroup(false);
                    setFormData(prev => ({ ...prev, group_name: null }));
                  } else {
                    setUseNewGroup(false);
                    setFormData(prev => ({ ...prev, group_name: value }));
                  }
                }}
                disabled={loadingGroups}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="그룹 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">그룹 없음</SelectItem>
                  {existingGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ 새 그룹 만들기</SelectItem>
                </SelectContent>
              </Select>
              {useNewGroup && (
                <Input
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  placeholder="새 그룹 이름 입력"
                />
              )}
            </div>
          </div>

          {/* API 제공자 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">API 제공자</label>
            <Select
              value={formData.api_provider}
              onValueChange={(value: ApiProvider) =>
                setFormData(prev => ({ ...prev, api_provider: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">자동 (Gemini + Seedream 번갈아)</SelectItem>
                <SelectItem value="gemini">Gemini만 사용</SelectItem>
                <SelectItem value="seedream">Seedream만 사용</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 기본 생성 개수 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">기본 생성 개수</label>
            <Select
              value={formData.default_count?.toString() || '2'}
              onValueChange={(value) =>
                setFormData(prev => ({ ...prev, default_count: parseInt(value) }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 6, 8, 10].map((count) => (
                  <SelectItem key={count} value={count.toString()}>
                    {count}장
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 체크박스 옵션들 */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allow_multiple"
                checked={formData.allow_multiple}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, allow_multiple: !!checked }))
                }
              />
              <label htmlFor="allow_multiple" className="text-sm cursor-pointer">
                여러 장 생성 가능 (장수 선택 옵션 표시)
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">레퍼런스 이미지</label>
              <Select
                value={formData.requires_reference || 'none'}
                onValueChange={(value) =>
                  setFormData(prev => ({ 
                    ...prev, 
                    requires_reference: value === 'none' ? null : value as 'required' | 'optional'
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">불필요</SelectItem>
                  <SelectItem value="optional">옵셔널 (선택사항)</SelectItem>
                  <SelectItem value="required">필수</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                저장 중...
              </>
            ) : (
              isEditing ? '수정' : '추가'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

