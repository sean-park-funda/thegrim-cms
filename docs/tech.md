# 더그림 CMS — 기술 스택 & 아키텍처

## 기술 스택

| 레이어 | 기술 | 버전 |
|--------|------|------|
| 프레임워크 | Next.js (App Router) | 16.0.7 |
| 언어 | TypeScript | 5.9.3 |
| UI 라이브러리 | React | 19.2.0 |
| 스타일링 | Tailwind CSS v4 | latest |
| UI 컴포넌트 | shadcn/ui (Radix UI 기반) | 1.4.3 |
| 상태 관리 | Zustand | 5.0.8 |
| 데이터베이스 | Supabase PostgreSQL | cloud |
| 인증 | Supabase Auth | 2.79.0 |
| 스토리지 | Supabase Storage | cloud |
| 이미지 처리 | Sharp | 0.34.5 |
| 3D 렌더링 | Three.js + @react-three/fiber | 0.182.0 |
| 차트 | Recharts | 3.7.0 |
| Excel 처리 | XLSX | 0.18.5 |
| 아이콘 | Lucide Icons | 0.552.0 |

## 외부 API

| 서비스 | 용도 |
|--------|------|
| Google Gemini 2.5 Pro | 이미지 분석, 프롬프트 생성, 대본 분석 |
| Google Gemini 3 Pro Preview | Script-to-Storyboard 컷 생성 |
| Veo 3.1 / Veo 3.1 Fast | 영상 생성 |
| ComfyUI (로컬 5090 PC) | LTX 2.3 22B FP8 이미지/영상 생성 |
| fal.ai | Kling O3, Vidu Q2 등 캐릭터 참조 영상 생성 |
| Lightsail (ComfyUI 릴레이) | Vercel → 5090 PC 브리지 API |

## 아키텍처 결정

### Next.js App Router 사용
- 서버 컴포넌트(RSC)는 현재 최소한으로 사용 중 — 대부분 클라이언트 컴포넌트
- API 라우트는 `app/api/` 에 위치 (Route Handlers)
- 레이아웃: `app/layout.tsx` → `components/AppLayout.tsx` → 각 페이지

### Supabase 패턴
- 클라이언트: `lib/supabase.ts` (anon key, 브라우저 전용)
- 서버 API 라우트: `service_role` key로 직접 REST 호출 또는 JS SDK
- RLS는 현재 완전 개방 상태 (내부 전용 서비스이므로 허용)
- 인증: `@supabase/ssr` 미들웨어 + `lib/hooks/useAuth.ts`

### 영상 생성 흐름
```
Vercel (프론트 + API Route)
  → AWS Lightsail (comfyui_router.py, FastAPI)
    → 5090 PC :8188 (ComfyUI WebSocket)
      → 결과: Supabase Storage 업로드 → 공개 URL 반환
```
- Lightsail 타임아웃: LTX 2.3 = 10분, WAN 2.2 = 20분 설정 필요
- 동시 요청 처리: ComfyUI 내부 큐 이용, 현재 프론트 폴링 방식

### 상태 관리
- Zustand 전역 스토어 (`lib/store/useStore.ts`)
- 복잡한 도메인은 별도 스토어: `useRelationshipStore`, `useSettlementStore`
- 서버 상태는 별도 라이브러리 없이 직접 fetch + useState

### 이미지 생성 구조
- `lib/image-generation/` — 프로바이더 추상화 레이어
  - `providers/` — 각 모델별 구현체
  - `batch/` — 배치 처리 로직
- API 라우트에서 provider 선택 후 호출

## 코드 컨벤션

### 파일/폴더 네이밍
- 컴포넌트: PascalCase (`FileGrid.tsx`)
- API 라우트: `route.ts`
- 유틸/훅: camelCase (`useAuth.ts`, `utils.ts`)
- 기능별 폴더: kebab-case (`free-creation/`, `script-to-movie/`)

### 경로 앨리어스
- `@/*` → 프로젝트 루트 (`tsconfig.json` 설정)
- 예: `import { supabase } from '@/lib/supabase'`

### 한국어 UI
- 모든 UI 텍스트는 한국어
- 주석은 한국어 또는 영어 혼용 허용
- 커밋 메시지는 영어

### 컴포넌트 패턴
- `'use client'` 지시어 명시 (클라이언트 컴포넌트)
- Props 타입은 인라인 또는 상단 interface 정의
- 대형 컴포넌트(`FileDetailDialog`, `ImageRegenerationWorkspace`)는 파일 단위 분리

## 제약사항

- **5090 PC 단일 노드**: 동시 영상 생성 시 ComfyUI 내부 큐로 직렬 처리 — 여러 사용자 동시 사용 시 대기 발생
- **Vercel 함수 타임아웃**: 기본 10초 (Pro 플랜 60초) — 영상 생성은 Lightsail 위임 필요
- **Supabase anon key**: 클라이언트에서 직접 DB 접근 — 민감 데이터는 서버 API 경유
- **fal.ai 이미지 업로드**: Supabase Storage URL 직접 불가 → `fal_client.upload_file()` 로 fal.ai Storage 업로드 필수
- **ComfyUI DynamicCombo**: 파라미터 형식이 dot notation (`"key": "value"`) — nested dict 사용 금지
