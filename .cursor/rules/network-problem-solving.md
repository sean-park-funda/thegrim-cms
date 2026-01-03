# 네트워크 문제 해결 원칙

## 핵심 원칙

**네트워크 문제는 항상 "재시도"로 해결하기 전에 근본적 해결법을 먼저 고민한다.**

## 근본적 해결 방법

### 1. 병렬 처리 → 순차 처리 + 딜레이

**문제**: 대용량 파일을 동시에 여러 개 업로드하면 네트워크 병목 발생
- `ECONNRESET`: 연결 리셋
- `ECONNABORTED`: 연결 중단
- `UND_ERR_SOCKET`: 소켓 오류

**해결**: 순차 처리 + 딜레이로 네트워크 부하 분산

```typescript
// ❌ 잘못된 방법: 병렬 처리 후 재시도
const results = await Promise.all(items.map(async (item) => {
  for (let retry = 0; retry < 3; retry++) {
    try {
      return await processItem(item);
    } catch (e) {
      await delay(retry * 1000);
    }
  }
}));

// ✅ 올바른 방법: 순차 처리 + 딜레이
const DELAY_BETWEEN_ITEMS = 20000; // 20초

for (let i = 0; i < items.length; i++) {
  if (i > 0) {
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ITEMS));
  }

  const result = await processItem(items[i]);
  // 각 항목 완료 즉시 UI 업데이트
  updateUI(result);
}
```

### 2. 백엔드 일괄 처리 → 프론트 개별 호출 (시작만 간격, 병렬 처리)

**문제**: 백엔드에서 모든 항목을 일괄 처리하면 UI가 모든 완료까지 대기

**해결**:
- 백엔드: 단일 항목 처리 API 제공
- 프론트: **시작만 20초 간격**으로 병렬 호출 + 각 완료 즉시 UI 업데이트

```typescript
// 프론트엔드 예시 - 시작만 20초 간격, 병렬 처리
const handleGenerateAll = async () => {
  const itemsToProcess = items.filter(item => !item.completed);
  const DELAY_BETWEEN_STARTS = 20000; // 시작 간격 20초

  const processItem = async (item, index) => {
    // 시작 딜레이 (첫 번째 제외)
    if (index > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_STARTS * index));
    }

    console.log(`시작 ${index + 1}/${itemsToProcess.length}: ${item.name}`);

    try {
      const res = await fetch(`/api/process/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ itemIds: [item.id] }),
      });

      const data = await res.json();

      // 완료 즉시 UI 업데이트
      console.log(`완료: ${item.name}`);
      setItems(prev => prev.map(prevItem =>
        prevItem.id === item.id ? data.result : prevItem
      ));
    } catch (err) {
      console.error(`${item.name} 처리 실패:`, err);
    }
  };

  // 모든 항목을 병렬로 시작 (시작만 20초 간격)
  await Promise.all(
    itemsToProcess.map((item, index) => processItem(item, index))
  );
};
```

### 3. 이미지 크기 최적화

대용량 이미지(3-5MB+)가 문제라면:
- 업로드 전 압축 고려
- 이미지 크기 설정 조정 (2K → 1K 등)
- 형식 변경 (PNG → JPEG)

## 적용 대상

- 배경 이미지 일괄 생성
- 캐릭터 이미지 일괄 생성
- 컷 이미지 일괄 생성
- 기타 대용량 파일 병렬 업로드

## 관련 코드 위치

- `app/script-to-movie/page.tsx` - 프론트엔드 순차 호출 로직
- `app/api/movie/[projectId]/generate-backgrounds/route.ts` - 단일 배경 처리 API

## 주의사항

1. 재시도 로직은 **마지막 수단**으로만 사용
2. 재시도보다 **근본적인 원인 해결** 우선
3. 네트워크 부하 분산을 위한 **시작 간격은 20초** 권장
4. **각 항목 완료 즉시 UI 업데이트**하여 사용자 경험 개선
