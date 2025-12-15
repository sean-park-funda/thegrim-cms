'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { manualGroups, manualFeatures, getFeaturesByGroup } from '@/lib/constants/manual';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">사용자 매뉴얼</h1>
              <p className="text-muted-foreground mt-2">
                더그림 작업관리 시스템의 모든 기능을 확인하고 사용 방법을 학습하세요.
              </p>
            </div>
          </div>
        </div>

        {/* 그룹별 섹션 */}
        <div className="space-y-12">
          {manualGroups.map((group) => {
            const features = getFeaturesByGroup(group.id);
            const GroupIcon = group.icon;

            return (
              <section key={group.id} className="space-y-4">
                {/* 그룹 헤더 */}
                <div className="flex items-center gap-3 pb-2 border-b">
                  <GroupIcon className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-semibold">{group.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                  </div>
                </div>

                {/* 기능 카드 그리드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {features.map((feature) => {
                    const FeatureIcon = feature.icon;

                    return (
                      <Link key={feature.id} href={`/manual/${feature.id}`}>
                        <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer">
                          <CardHeader>
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <FeatureIcon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <CardTitle className="text-lg">{feature.name}</CardTitle>
                                <CardDescription className="mt-1">
                                  {feature.description}
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-1">
                              {feature.details.slice(0, 3).map((detail, index) => (
                                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-primary mt-1">•</span>
                                  <span>{detail}</span>
                                </li>
                              ))}
                              {feature.details.length > 3 && (
                                <li className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-primary mt-1">•</span>
                                  <span>그 외 {feature.details.length - 3}개 기능</span>
                                </li>
                              )}
                            </ul>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

