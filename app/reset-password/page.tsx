'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { updatePassword } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, CheckCircle, AlertCircle } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useStore();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Supabase가 URL fragment에서 세션을 자동으로 처리한 후 user가 설정됨
  useEffect(() => {
    if (authLoading) return;
    
    // URL에 error가 있는지 확인
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    if (errorParam) {
      setError(errorDescription || '유효하지 않은 링크입니다.');
      setIsCheckingSession(false);
      return;
    }
    
    // 사용자 세션이 있으면 유효한 세션
    if (user) {
      setIsValidSession(true);
    }
    
    setIsCheckingSession(false);
  }, [authLoading, user, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 비밀번호 유효성 검사
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    setError(''); // 에러 초기화

    try {
      await updatePassword(password);
      setIsSuccess(true);
      setIsLoading(false); // 성공 시 로딩 상태 해제
      
      // 3초 후 로그인 페이지로 이동
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      console.error('비밀번호 변경 오류:', err);
      setError(err.message || '비밀번호 변경에 실패했습니다.');
      setIsLoading(false); // 에러 발생 시 로딩 상태 해제
    }
  };

  // 로딩 중
  if (authLoading || isCheckingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  // 성공 화면
  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>비밀번호가 변경되었습니다</CardTitle>
            <CardDescription>
              새 비밀번호로 로그인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center mb-4">
              잠시 후 로그인 페이지로 이동합니다...
            </p>
            <Link href="/login" className="block">
              <Button className="w-full">
                로그인하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 유효하지 않은 세션
  if (!isValidSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>유효하지 않은 링크</CardTitle>
            <CardDescription>
              {error || '비밀번호 재설정 링크가 만료되었거나 유효하지 않습니다.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              비밀번호를 재설정하려면 다시 요청해주세요.
            </p>
            <Link href="/forgot-password" className="block">
              <Button className="w-full">
                비밀번호 재설정 다시 요청
              </Button>
            </Link>
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full">
                로그인으로 돌아가기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 비밀번호 재설정 폼
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-center">새 비밀번호 설정</CardTitle>
          <CardDescription className="text-center">
            사용하실 새 비밀번호를 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                새 비밀번호
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
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
                minLength={6}
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}



