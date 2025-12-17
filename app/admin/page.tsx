'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { createInvitation, getInvitations, getUsers, updateUserRole, UserProfile } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Mail, UserPlus, CheckCircle2, XCircle, Clock, Users, Shield, Settings } from 'lucide-react';
import { getImageRegenerationSettings, updateImageRegenerationSetting, ImageRegenerationSetting } from '@/lib/api/settings';
import { getStyles } from '@/lib/api/aiStyles';
import { AiRegenerationStyle } from '@/lib/supabase';
import { Checkbox } from '@/components/ui/checkbox';

export default function AdminPage() {
  const router = useRouter();
  // useAuth()는 AppLayout에서 호출되므로 여기서는 useStore()만 사용
  const { user, profile, isLoading } = useStore();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'staff' | 'viewer'>('staff');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [updatingRoles, setUpdatingRoles] = useState<Set<string>>(new Set());
  const [regenerationSettings, setRegenerationSettings] = useState<ImageRegenerationSetting[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState<Set<string>>(new Set());
  const [styles, setStyles] = useState<AiRegenerationStyle[]>([]);

  useEffect(() => {
    if (!isLoading && (!user || profile?.role !== 'admin')) {
      router.push('/');
    }
  }, [isLoading, user, profile, router]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadInvitations();
      loadUsers();
      loadRegenerationSettings();
    }
  }, [profile]);

  const loadInvitations = async () => {
    try {
      setIsLoadingInvitations(true);
      const data = await getInvitations();
      setInvitations(data);
    } catch (err: any) {
      console.error('초대 목록 로드 오류:', err);
      setError('초대 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  const loadUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('유저 목록 로드 오류:', err);
      setError('유저 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserProfile['role']) => {
    try {
      setUpdatingRoles(prev => new Set(prev).add(userId));
      await updateUserRole(userId, newRole);
      await loadUsers();
      setSuccess('사용자 역할이 업데이트되었습니다.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('역할 업데이트 오류:', err);
      setError(err.message || '역할 업데이트에 실패했습니다.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setUpdatingRoles(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      admin: { label: '관리자', variant: 'destructive' },
      manager: { label: '매니저', variant: 'default' },
      staff: { label: '스태프', variant: 'secondary' },
      viewer: { label: '조회자', variant: 'outline' },
    };
    const roleInfo = roleMap[role] || { label: role, variant: 'outline' as const };
    return <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>;
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !user) {
      setError('이메일을 입력해주세요.');
      return;
    }

    try {
      setIsCreating(true);
      console.log('초대 생성 시도:', { email, role, userId: user.id });
      const invitation = await createInvitation(email, role, user.id);
      console.log('초대 생성 성공:', invitation);
      setSuccess(`초대가 생성되었습니다! 이메일이 ${email}로 전송되었습니다.`);
      setEmail('');
      setRole('staff');
      await loadInvitations();
    } catch (err: any) {
      console.error('초대 생성 오류 상세:', err);
      console.error('에러 타입:', typeof err);
      console.error('에러 객체:', JSON.stringify(err, null, 2));
      const errorMessage = err.message || err.error?.message || err.toString() || '초대 생성에 실패했습니다.';
      setError(errorMessage);
      alert(`초대 생성 실패: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  };

  const copyInvitationLink = (token: string) => {
    if (typeof window === 'undefined') return;
    
    // 환경 변수 사용 (빌드 시 오류 방지)
    const origin = process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    
    if (!origin) {
      console.warn('NEXT_PUBLIC_APP_URL 또는 VERCEL_URL 환경 변수가 설정되지 않았습니다.');
      return;
    }
    
    const link = `${origin}/signup?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const loadRegenerationSettings = async () => {
    try {
      setIsLoadingSettings(true);
      const [settings, loadedStyles] = await Promise.all([
        getImageRegenerationSettings(),
        getStyles(),
      ]);
      setRegenerationSettings(settings);
      setStyles(loadedStyles);
    } catch (err: any) {
      console.error('설정 로드 오류:', err);
      setError('설정을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleUpdateSetting = async (styleId: string, useReference: boolean) => {
    try {
      setUpdatingSettings(prev => new Set(prev).add(styleId));
      await updateImageRegenerationSetting(styleId, useReference);
      await loadRegenerationSettings();
      setSuccess('설정이 업데이트되었습니다.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('설정 업데이트 오류:', err);
      setError(err.message || '설정 업데이트에 실패했습니다.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setUpdatingSettings(prev => {
        const next = new Set(prev);
        next.delete(styleId);
        return next;
      });
    }
  };

  const getSettingForStyle = (styleId: string): boolean => {
    const setting = regenerationSettings.find(s => s.style_id === styleId);
    return setting?.use_reference ?? false;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!user || profile?.role !== 'admin') {
    return null;
  }

  const getStatusBadge = (invitation: any) => {
    if (invitation.used_at) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />사용됨</Badge>;
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />만료됨</Badge>;
    }
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />대기중</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">관리자 페이지</h1>
        <p className="text-muted-foreground">사용자 초대 및 관리</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 text-sm text-green-600 bg-green-50 p-3 rounded-md">
          {success}
        </div>
      )}

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            사용자 관리
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Mail className="h-4 w-4 mr-2" />
            초대 관리
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            이미지 재생성 설정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                사용자 목록
              </CardTitle>
              <CardDescription>등록된 모든 사용자를 확인하고 역할을 수정할 수 있습니다</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUsers ? (
                <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">사용자가 없습니다</div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {users.map((userItem) => (
                    <div key={userItem.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium">{userItem.name || userItem.email}</div>
                          <div className="text-sm text-muted-foreground mt-1">{userItem.email}</div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-muted-foreground">현재 역할:</span>
                            {getRoleBadge(userItem.role)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            가입일: {new Date(userItem.created_at).toLocaleDateString('ko-KR')}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <Select
                            value={userItem.role}
                            onValueChange={(value: UserProfile['role']) => handleUpdateUserRole(userItem.id, value)}
                            disabled={updatingRoles.has(userItem.id) || userItem.id === user?.id}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">관리자</SelectItem>
                              <SelectItem value="manager">매니저</SelectItem>
                              <SelectItem value="staff">스태프</SelectItem>
                              <SelectItem value="viewer">조회자</SelectItem>
                            </SelectContent>
                          </Select>
                          {userItem.id === user?.id && (
                            <span className="text-xs text-muted-foreground">(본인)</span>
                          )}
                          {updatingRoles.has(userItem.id) && (
                            <span className="text-xs text-muted-foreground">업데이트 중...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* 초대 생성 폼 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              새 초대 생성
            </CardTitle>
            <CardDescription>사용자를 초대하여 시스템에 추가하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateInvitation} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  이메일
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">
                  역할
                </label>
                <Select value={role} onValueChange={(value: any) => setRole(value)} disabled={isCreating}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">관리자</SelectItem>
                    <SelectItem value="manager">매니저</SelectItem>
                    <SelectItem value="staff">스태프</SelectItem>
                    <SelectItem value="viewer">조회자</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isCreating}>
                {isCreating ? '생성 중...' : '초대 생성'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 초대 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              초대 목록
            </CardTitle>
            <CardDescription>생성된 초대 목록을 확인하고 관리하세요</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvitations ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">초대가 없습니다</div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{invitation.email}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          역할: <Badge variant="outline">{invitation.role}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          만료일: {new Date(invitation.expires_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      {getStatusBadge(invitation)}
                    </div>
                    {!invitation.used_at && new Date(invitation.expires_at) >= new Date() && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => copyInvitationLink(invitation.token)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {copiedToken === invitation.token ? '복사됨!' : '초대 링크 복사'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                이미지 재생성 설정
              </CardTitle>
              <CardDescription>
                각 이미지 재생성 스타일별로 레퍼런스 이미지 사용 여부를 설정할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSettings ? (
                <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
              ) : styles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">등록된 스타일이 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {styles.map((style) => {
                    const useReference = getSettingForStyle(style.style_key);
                    const isUpdating = updatingSettings.has(style.style_key);
                    const isRequired = style.requires_reference === 'required';
                    const isOptional = style.requires_reference === 'optional';

                    return (
                      <div key={style.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{style.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {isRequired ? '(레퍼런스 이미지 필수)' : isOptional ? '(레퍼런스 이미지 옵셔널)' : '(레퍼런스 이미지 불필요)'}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`setting-${style.style_key}`}
                            checked={useReference || isRequired}
                            disabled={isRequired || isUpdating}
                            onCheckedChange={(checked) => {
                              if (!isRequired) {
                                handleUpdateSetting(style.style_key, checked === true);
                              }
                            }}
                          />
                          <label
                            htmlFor={`setting-${style.style_key}`}
                            className={`text-sm font-medium ${
                              isRequired ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          >
                            레퍼런스 사용
                          </label>
                          {isUpdating && (
                            <span className="text-xs text-muted-foreground">업데이트 중...</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

