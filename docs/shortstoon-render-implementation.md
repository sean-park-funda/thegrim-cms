# 쇼츠툰 컷 렌더링 구현 현황

## 개요

쇼츠툰 에디터에서 "이 컷 렌더링" 버튼을 누르면, 정적 이미지 + 효과 설정을 조합해 MP4 영상을 생성한다.

---

## FFmpeg 실행 위치

**Vercel 서버리스 함수** (`/app/api/shortstoon/render/route.ts`) 내에서 `child_process.execFile`로 직접 실행한다.

- Vercel 환경에는 FFmpeg이 기본 포함되지 않으므로, `@ffmpeg-installer/ffmpeg` npm 패키지 또는 `ffmpeg-static`을 통해 번들된 바이너리를 사용한다.
- 실행 환경: Vercel Serverless (Node.js 런타임), AWS Lambda 계열 (x86_64 리눅스)
- 타임아웃: 120초 (`execFileAsync` 옵션)
- 임시 파일: `/tmp/ss-render-{timestamp}/` 에 생성 후 처리 완료 시 삭제

---

## 전체 플로우

```
클라이언트 (버튼 클릭)
  └→ POST /api/shortstoon/render { blockId }
       ├→ DB에서 블록 조회 (image_url, viewport, effect, duration 등)
       ├→ DB status → 'rendering'
       ├→ Supabase Storage에서 원본 이미지 다운로드 → /tmp/.../input.jpg
       ├→ Sharp로 원본 이미지 크기 측정
       ├→ FFmpeg 인수 생성 (효과별 분기)
       ├→ FFmpeg 실행 → /tmp/.../output.mp4
       ├→ output.mp4 → Supabase Storage 업로드
       │     경로: webtoon-files/shortstoon/{projectId}/blocks/{blockId}_{ts}.mp4
       ├→ DB status → 'completed', video_url, video_path 저장
       └→ 업데이트된 블록 JSON 반환
클라이언트
  └→ 블록 상태 갱신, video 태그로 재생
```

---

## 출력 스펙

| 항목 | 값 |
|------|-----|
| 해상도 | 1080 × 1920 (세로 쇼츠 고정) |
| 프레임레이트 | 30fps |
| 코덱 | H.264 (libx264) |
| 품질 | CRF 23 |
| 인코딩 프리셋 | fast |
| 색상 포맷 | yuv420p (브라우저 호환) |
| 웹 최적화 | `-movflags +faststart` (스트리밍 즉시 재생) |

---

## 효과별 FFmpeg 필터

### 공통 전처리

원본 이미지를 출력 해상도에 맞게 스케일링한다. `scale` 옵션으로 cover 방식 적용:

```
scale=W:H:force_original_aspect_ratio=increase
```

뷰포트 offset_x/y 값을 픽셀 cropX/Y로 변환:

```
cropX = round(maxOffX * viewport.offset_x)
cropY = round(maxOffY * viewport.offset_y)
```

---

### none (정적)

```
-loop 1 -i input.jpg
-vf scale=...,crop=1080:1920:cropX:cropY
-t {duration} -r 30
```

이미지를 지정 시간 동안 정적으로 표시.

---

### scroll_h (좌우 스크롤)

```
-vf scale=...,crop=1080:1920:'startX + t/duration * (endX - startX)':cropY
```

- 좌 방향: startX = scrollRange → endX = 0 (이미지가 왼쪽으로 이동)
- 우 방향: startX = 0 → endX = scrollRange (이미지가 오른쪽으로 이동)
- `scrollRange = max(outW, scaledW - outW)`
- ⚠️ **현재 버그**: `amount` 파라미터 미반영 — 전체 스크롤 범위를 항상 사용함

---

### scroll_v (상하 스크롤)

```
-vf scale=...,crop=1080:1920:cropX:'startY + t/duration * (endY - startY)'
```

- 상 방향: startY = scrollRange → endY = 0
- 하 방향: startY = 0 → endY = scrollRange
- ⚠️ **현재 버그**: `amount` 파라미터 미반영

---

### zoom_in / zoom_out

```
-vf scale=...,crop=...,zoompan=z='fromZ + (toZ - fromZ) * on / frames'
                             :x='iw/2 - (iw/zoom/2)'
                             :y='ih/2 - (ih/zoom/2)'
                             :d={frames}:s=1080x1920:fps=30
```

- `zoompan` 필터로 줌 배율을 프레임 단위로 보간
- `on` = 현재 프레임 번호
- ⚠️ **현재 버그**: `delta` 파라미터 미반영 — 하드코딩된 `from`/`to` 사용

---

### shake (흔들기)

```
-vf scale={W+amp*4}:{H+amp*4},
   crop=1080:1920:
     'cropX + amp*2 + amp*sin(2*PI*freq*t)':
     'cropY + amp*2 + amp*sin(2*PI*freq*t + PI/3)'
```

- 이미지를 진폭 × 4만큼 크게 스케일한 뒤 sin 함수로 진동
- X/Y를 위상 차이(π/3)를 두고 흔들어 대각선 방향 진동 표현

---

### flash (번쩍임)

```
-vf scale=...,crop=...,eq=brightness='minB/2 * sin(2*PI*t/interval) - minB/2'
```

- `eq` 필터로 밝기를 사인 함수로 주기적으로 변화

---

## 미리보기와 렌더링의 관계

| 항목 | 미리보기 (Canvas) | 렌더링 (FFmpeg) |
|------|------------------|-----------------|
| 구현 위치 | `ViewportEditor.tsx` `computeDraw()` | `route.ts` FFmpeg 인수 생성부 |
| 좌표 계산 | JavaScript | FFmpeg 필터 수식 |
| `amount` 파라미터 | ✅ 반영됨 | ❌ 미반영 (버그) |
| `delta` 파라미터 | ✅ 반영됨 | ❌ 미반영 (버그) |
| 방향 로직 | 최근 수정됨 | 수정 필요 |

---

## 알려진 버그 및 개선 필요 사항

| 우선순위 | 항목 | 내용 |
|----------|------|------|
| 🔴 높음 | amount 미반영 | 스크롤 효과: 서버가 amount 파라미터 무시 → 미리보기와 결과 불일치 |
| 🔴 높음 | delta 미반영 | 줌 효과: 서버가 delta 대신 하드코딩 from/to 사용 |
| 🔴 높음 | 에러 시 DB 미갱신 | 실패 시 status가 'rendering'에 영구히 갇힘 |
| 🟡 중간 | 스크롤 방향 불일치 | 서버 방향 로직이 클라이언트와 반대 |
| 🟡 중간 | 새로고침 시 상태 손실 | await 구조라 중간에 탭 닫으면 결과 미수신 |
| 🟢 낮음 | 이전 파일 누적 | 재렌더링 시 이전 MP4 파일이 Storage에 남음 |
| 🟢 낮음 | 동시 렌더링 제한 없음 | 다중 요청 시 FFmpeg 병렬 실행으로 서버 부하 |
