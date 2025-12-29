'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await sendPasswordResetEmail(email);
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || '비밀번호 재설정 이메일 발송에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>이메일을 확인해주세요</CardTitle>
            <CardDescription>
              <span className="font-medium text-foreground">{email}</span>로 비밀번호 재설정 링크를 발송했습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              이메일이 도착하지 않았다면 스팸 폴더를 확인해주세요.
            </p>
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                로그인으로 돌아가기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-center">비밀번호 찾기</CardTitle>
          <CardDescription className="text-center">
            가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
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
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {isLoading ? '발송 중...' : '재설정 링크 보내기'}
            </Button>
            <Link href="/login" className="block">
              <Button variant="ghost" className="w-full text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                로그인으로 돌아가기
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

