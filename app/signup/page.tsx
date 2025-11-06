'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signUp, verifyInvitationToken } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { setUser, setProfile } = useStore();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      verifyToken(tokenParam);
    }
  }, [searchParams]);

  const verifyToken = async (tokenValue: string) => {
    try {
      const invitation = await verifyInvitationToken(tokenValue);
      if (invitation) {
        if (invitation.used_at) {
          setError('이미 사용된 초대 링크입니다.');
          return;
        }
        if (new Date(invitation.expires_at) < new Date()) {
          setError('만료된 초대 링크입니다.');
          return;
        }
        setInvitationInfo({ email: invitation.email, role: invitation.role });
        setEmail(invitation.email);
      } else {
        setError('유효하지 않은 초대 링크입니다.');
      }
    } catch (err: any) {
      setError('초대 링크 검증에 실패했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);

    try {
      const { user } = await signUp(email, password, token || undefined, name);
      if (user) {
        // 회원가입 성공, 로그인 페이지로 리다이렉트
        router.push('/login?email=' + encodeURIComponent(email) + '&signup=success');
      }
    } catch (err: any) {
      setError(err.message || '회원가입에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  // 초대 토큰이 없어도 첫 사용자는 회원가입 가능 (자동으로 관리자)
  // if (!token && !invitationInfo) {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen bg-gray-50">
  //       <Card className="w-full max-w-md">
  //         <CardHeader>
  //           <CardTitle>초대 링크 필요</CardTitle>
  //           <CardDescription>회원가입을 위해서는 초대 링크가 필요합니다.</CardDescription>
  //         </CardHeader>
  //         <CardContent>
  //           <div className="text-sm text-muted-foreground">
  //             관리자로부터 받은 초대 링크를 사용하여 회원가입하세요.
  //           </div>
  //         </CardContent>
  //       </Card>
  //     </div>
  //   );
  // }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>회원가입</CardTitle>
          <CardDescription>
            {invitationInfo && (
              <span>
                {invitationInfo.email}로 {invitationInfo.role} 역할로 초대되었습니다.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                이메일
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!invitationInfo}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                이름 (선택사항)
              </label>
              <Input
                id="name"
                type="text"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                비밀번호 확인
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '가입 중...' : '회원가입'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}

