# 스크롤 및 레이아웃 높이 문제 해결 가이드

## 문제 상황
컴포넌트에서 스크롤이 생기지 않거나, 브라우저의 세로 공간을 모두 활용하지 못하는 문제가 발생할 수 있습니다.

## 핵심 원칙

### 1. 높이 체인 명확히 하기
높이는 상위에서 하위로 명확하게 전달되어야 합니다.

```
AppLayout (h-screen = 100vh)
  └─ children wrapper (flex-1 overflow-hidden)
      └─ Page (flex-1 h-full)
          └─ Content Container (h-full 또는 flex-1)
              └─ Scrollable Area (flex: 1 1 0, overflow-y: auto, minHeight: 0)
```

### 2. overflow-hidden 제거 원칙
스크롤이 필요한 영역의 부모에서 `overflow-hidden`을 제거해야 합니다.

**잘못된 예:**
```tsx
<div className="flex-1 overflow-hidden">  {/* ❌ 스크롤 막음 */}
  <div className="h-full overflow-y-auto">
    {/* 스크롤이 작동하지 않음 */}
  </div>
</div>
```

**올바른 예:**
```tsx
<div className="flex-1">  {/* ✅ overflow-hidden 제거 */}
  <div className="h-full overflow-y-auto">
    {/* 스크롤이 정상 작동 */}
  </div>
</div>
```

### 3. Flex 컨테이너 내 높이 설정
Flex 컨테이너 내에서 자식 요소의 높이를 설정할 때는 `height: 100%` 대신 `flex: 1 1 0`을 사용합니다.

**잘못된 예:**
```tsx
<div className="flex flex-col h-full">
  <div style={{ height: '100%' }}>  {/* ❌ flex 컨테이너 내에서 작동 안 함 */}
    {/* 내용 */}
  </div>
</div>
```

**올바른 예:**
```tsx
<div className="flex flex-col h-full">
  <div style={{ flex: '1 1 0', minHeight: 0 }}>  {/* ✅ flex 속성 사용 */}
    {/* 내용 */}
  </div>
</div>
```

### 4. 스크롤 영역 설정
스크롤이 필요한 영역에는 다음 속성을 모두 설정합니다:
- `flex: 1 1 0` 또는 `flex: 1`
- `overflow-y: auto`
- `minHeight: 0` (중요!)

**완전한 예:**
```tsx
<div style={{ 
  flex: '1 1 0',
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  position: 'relative'
}}>
  {/* 스크롤 가능한 내용 */}
</div>
```

## 실제 해결 사례: FileGrid 스크롤 문제

### 문제
파일 그리드에서 스크롤이 생기지 않고, 브라우저의 세로 공간을 모두 활용하지 못함.

### 해결 과정

#### 1단계: overflow-hidden 제거
```tsx
// app/webtoons/[webtoonId]/episodes/[episodeId]/cuts/[cutId]/page.tsx
// ❌ 이전
<div className="flex-1 overflow-hidden bg-background">
  <div className="h-full overflow-hidden">
    <FileGridWithSuspense />
  </div>
</div>

// ✅ 수정 후
<div className="flex-1 h-full bg-background">
  <div className="h-full">
    <FileGridWithSuspense />
  </div>
</div>
```

#### 2단계: Flex 컨테이너 설정
```tsx
// components/FileGridWithSuspense.tsx
// ✅ flex 컨테이너로 설정
<div className="h-full flex flex-col">
  <Suspense>
    <FileGrid cutId={cutId} />
  </Suspense>
</div>
```

#### 3단계: FileGrid 높이 설정
```tsx
// components/FileGrid.tsx
// ❌ 이전
<div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

// ✅ 수정 후
<div style={{ 
  flex: '1 1 0',
  display: 'flex', 
  flexDirection: 'column',
  minHeight: 0
}}>
```

#### 4단계: 스크롤 영역 설정
```tsx
// components/FileGrid.tsx
// ✅ 스크롤 영역
<div style={{ 
  flex: '1 1 0',
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  position: 'relative'
}}>
  {/* 스크롤 가능한 내용 */}
</div>
```

## 체크리스트

스크롤 문제가 발생하면 다음을 확인하세요:

- [ ] 스크롤이 필요한 영역의 부모에 `overflow-hidden`이 있는가?
- [ ] 높이 체인이 명확하게 전달되고 있는가? (`h-screen` → `flex-1` → `h-full` → `flex: 1`)
- [ ] Flex 컨테이너 내에서 `height: 100%` 대신 `flex: 1 1 0`을 사용하고 있는가?
- [ ] 스크롤 영역에 `minHeight: 0`이 설정되어 있는가?
- [ ] 스크롤 영역에 `overflow-y: auto`가 설정되어 있는가?
- [ ] 모든 중간 컨테이너가 높이를 제대로 전달하고 있는가?

## 주의사항

1. **AppLayout의 overflow-hidden**: AppLayout의 children wrapper에 `overflow-hidden`이 있어도, 그 내부의 페이지에서 스크롤이 필요하면 해당 레벨에서 제거해야 합니다.

2. **minHeight: 0의 중요성**: Flex 컨테이너 내에서 스크롤이 작동하려면 `minHeight: 0`이 필수입니다. 이것이 없으면 flex item이 내용에 맞춰 확장되어 스크롤이 생기지 않습니다.

3. **Tailwind vs 인라인 스타일**: 복잡한 레이아웃 문제 해결 시 인라인 스타일을 사용하면 더 명확하게 제어할 수 있습니다.

4. **테스트 방법**: 개발자 도구에서 각 요소의 computed height를 확인하여 높이가 제대로 전달되는지 확인하세요.

## 관련 파일
- `components/FileGrid.tsx`
- `components/FileGridWithSuspense.tsx`
- `app/webtoons/[webtoonId]/episodes/[episodeId]/cuts/[cutId]/page.tsx`
- `components/AppLayout.tsx`








