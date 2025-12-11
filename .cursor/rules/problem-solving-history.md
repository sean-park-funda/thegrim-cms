# 문제 해결 이력 관리 규칙

## 목적
동일한 문제가 반복될 때, 과거 시도한 수정사항을 복기하여 중복 시도를 방지하고 새로운 접근 방법을 찾을 수 있도록 합니다.

## 규칙

### 문제 반복 시 필수 절차

1. **과거 시도 사항 복기**
   - 이전에 시도한 모든 방법을 문서화
   - 각 방법의 실패 원인 분석
   - 관련 코드 변경 이력 확인

2. **근본 원인 재분석**
   - 과거 분석이 잘못되었을 수 있으므로 재분석
   - 문제의 핵심을 다시 파악
   - 관련 컴포넌트와 라이브러리 동작 방식 재확인

3. **새로운 접근 방법 수립**
   - 과거 시도한 방법과 완전히 다른 접근
   - 문제의 근본 원인을 해결하는 방법
   - 가능하면 더 단순한 해결책 우선

4. **문서화**
   - 새로운 시도 방법과 결과를 문서화
   - 성공/실패 여부와 원인 기록

## 파일 그리드 스크롤 문제 이력

### 문제 설명
파일 그리드에서 스크롤이 생기지 않아 아래 항목을 볼 수 없음.

### 과거 시도한 방법들

#### 시도 1: ScrollArea 사용
- **방법**: ScrollArea 컴포넌트로 감싸기
- **실패 원인**: Viewport 높이 제약 문제
- **코드 위치**: `components/FileGrid.tsx` 676줄

#### 시도 2: 일반 div에 overflow-y-auto
- **방법**: `<div className="overflow-y-auto">` 사용
- **실패 원인**: 높이 제약이 전달되지 않음
- **코드 위치**: `components/FileGrid.tsx` 676줄

#### 시도 3: TabsContent에 flex flex-col 추가
- **방법**: `className="flex-1 flex flex-col overflow-hidden"`
- **실패 원인**: Radix UI의 hidden 상태에서 높이 계산 안됨
- **코드 위치**: `components/FileGrid.tsx` 673줄

#### 시도 4: data-[state=active]:h-full 추가
- **방법**: 활성 상태일 때만 높이 설정
- **실패 원인**: hidden 상태에서 높이 계산이 안됨
- **코드 위치**: `components/FileGrid.tsx` 673줄

#### 시도 5: 인라인 스타일 추가
- **방법**: `style={{ height: '100%' }}` 사용
- **실패 원인**: Radix UI의 hidden 처리와 충돌
- **코드 위치**: `components/FileGrid.tsx` 670-700줄

#### 시도 6: visibility와 absolute 사용
- **방법**: `data-[state=inactive]:invisible data-[state=inactive]:absolute`
- **실패 원인**: 여전히 높이 계산이 안됨
- **코드 위치**: `components/FileGrid.tsx` 673줄, `components/ui/tabs.tsx` 60줄

#### 시도 7: TabsContent 제거 + hidden 클래스
- **방법**: TabsContent를 제거하고 직접 div로 렌더링, hidden 클래스 사용
- **실패 원인**: hidden 클래스가 높이 계산을 막음
- **코드 위치**: `components/FileGrid.tsx` 664-706줄

#### 시도 8: TabsContent 제거 + absolute/invisible
- **방법**: TabsContent를 제거하고 직접 div로 렌더링, absolute/invisible 사용
- **실패 원인**: absolute 위치 지정이 높이 계산을 방해함
- **코드 위치**: `components/FileGrid.tsx` 664-706줄

### 핵심 문제
1. Radix UI TabsContent는 비활성 탭에 `hidden` 속성을 사용하여 DOM에서 완전히 제거됨
2. 여러 레이어를 거치면서 높이 제약이 전달되지 않음
3. ProcessFileSection이 Card로 감싸져 있어 높이 제약 전달이 복잡함

### 현재 구조 분석
```
CutDetailPage (h-full overflow-hidden)
  └─ FileGridWithSuspense (h-full overflow-hidden)
      └─ FileGrid (h-full flex flex-col overflow-hidden)
          └─ Tabs (flex-1 flex flex-col overflow-hidden min-h-0)
              ├─ TabsList (flex-shrink-0)
              └─ 직접 렌더링된 div들 (flex-1 flex flex-col overflow-hidden min-h-0)
                  └─ 스크롤 div (flex-1 min-h-0 overflow-y-auto)
                      └─ padding div (p-3 sm:p-4)
                          └─ ProcessFileSection
                              └─ Card
                                  └─ CardContent
```

#### 시도 9: ProcessFileSection의 Card 제거
- **방법**: Card와 CardContent를 div로 변경
- **실패 원인**: 여전히 높이 제약이 전달되지 않음
- **코드 위치**: `components/ProcessFileSection.tsx` 91-93줄

#### 시도 10: FileGrid를 극단적으로 단순화 (인라인 스타일)
- **방법**: Tailwind 클래스를 모두 제거하고 인라인 스타일만 사용, ProcessFileSection 제거하고 직접 렌더링
- **실패 원인**: 여전히 스크롤이 작동하지 않음
- **코드 위치**: `components/FileGrid.tsx` 634-690줄

#### 시도 11: FileGridWithSuspense의 overflow-hidden 제거
- **방법**: `overflow-hidden` 클래스 제거
- **실패 원인**: 여전히 스크롤이 작동하지 않음
- **코드 위치**: `components/FileGridWithSuspense.tsx` 12줄

#### 시도 12: CutDetailPage의 FileGrid wrapper overflow-hidden 제거
- **방법**: FileGridWithSuspense를 감싸는 div의 `overflow-hidden` 제거
- **실패 원인**: 여전히 스크롤이 작동하지 않음
- **코드 위치**: `app/webtoons/[webtoonId]/episodes/[episodeId]/cuts/[cutId]/page.tsx` 56, 84줄

### 핵심 문제 재분석
높이 체인 분석:
```
AppLayout (h-screen = 100vh)
  └─ children wrapper (flex-1 overflow-hidden) ← 여기서 overflow-hidden
      └─ CutDetailPage (flex-1 overflow-hidden) ← 여기서도 overflow-hidden
          └─ grid container (h-full overflow-hidden) ← 여기서도 overflow-hidden
              └─ FileGridWithSuspense wrapper (h-full) ← overflow-hidden 제거됨
                  └─ FileGrid (height: 100%, display: flex, flexDirection: column)
                      └─ 탭 목록 (flexShrink: 0)
                      └─ 컨텐츠 (flex: 1, overflowY: 'auto', minHeight: 0)
```

문제: 여러 레벨에서 `overflow-hidden`이 있어서 스크롤이 막히고 있음. 또한 `flex-1`과 `h-full`이 혼용되면서 높이 계산이 제대로 되지 않을 수 있음.

#### 시도 13: CutDetailPage의 overflow-hidden 제거
- **방법**: CutDetailPage의 최상위 div와 grid 컨테이너의 `overflow-hidden` 제거
- **실패 원인**: 여전히 높이가 제대로 전달되지 않음
- **코드 위치**: `app/webtoons/[webtoonId]/episodes/[episodeId]/cuts/[cutId]/page.tsx` 48, 50줄

#### 시도 14: 높이 체인 명확히 하기 (성공)
- **방법**: 
  1. CutDetailPage에 `h-full` 추가
  2. FileGridWithSuspense를 `flex flex-col`로 설정
  3. FileGrid의 최상위 div를 `height: 100%`에서 `flex: 1 1 0`으로 변경
  4. 스크롤 영역에 `minHeight: 0` 명시적 추가
- **성공 원인**: 
  - 높이 체인이 명확하게 전달됨
  - Flex 컨테이너 내에서 올바른 속성 사용
  - `minHeight: 0`으로 flex item의 기본 동작 오버라이드
- **코드 위치**: 
  - `app/webtoons/[webtoonId]/episodes/[episodeId]/cuts/[cutId]/page.tsx` 48줄
  - `components/FileGridWithSuspense.tsx` 12줄
  - `components/FileGrid.tsx` 640-646줄, 681-687줄

### 최종 해결 방법
자세한 내용은 `.cursor/rules/scroll-layout-guide.md` 참고

