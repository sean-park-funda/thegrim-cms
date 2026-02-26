# TheGrim CMS — 프로젝트 컨텍스트 & 변경이력

> **용도**: AI 에이전트(Claude Code, OpenClaw 등)가 세션 시작 시 이 파일을 읽고 프로젝트 맥락을 빠르게 파악.
> 전체 코드를 탐색하지 않고도 현재 상태를 이해할 수 있도록 유지한다.

---

## 프로젝트 개요

- **스택**: Next.js 16 (App Router) + React 19 + Supabase + Tailwind CSS v4
- **배포**: Vercel (main push → 자동배포)
- **패키지매니저**: npm
- **UI**: shadcn/ui (Radix) + Lucide Icons
- **상태관리**: Zustand
- **DB**: Supabase (PostgreSQL + Auth + Storage)

---

## 코드 구조

```
thegrim-cms/
├── app/                          # Next.js App Router
│   ├── accounting/settlement/    # ★ RS 정산 모듈 (아래 상세)
│   ├── webtoons/                 # 웹툰 관리 (목록/에피소드/컷/캐릭터)
│   ├── webtoonanimation/         # 웹툰→영상 변환
│   ├── script-to-storyboard/     # 대본→콘티 생성
│   ├── script-to-movie/          # 대본→영상 생성
│   ├── script-to-shorts/         # 대본→쇼츠 생성
│   ├── free-creation/            # 자유 AI 이미지 생성
│   ├── monster-generator/        # 괴수 이미지 생성기
│   ├── admin/                    # 관리자 (유저/역할 관리)
│   ├── manual/                   # 서비스 사용설명서
│   └── api/                      # API Routes
│       ├── accounting/settlement/  # 정산 API (아래 상세)
│       └── webtoonanimation/       # 영상변환 API
│
├── components/
│   ├── settlement/               # 정산 UI 컴포넌트 (12개)
│   ├── webtoonanimation/         # 영상변환 컴포넌트
│   ├── movie/, shorts/           # 영상/쇼츠 생성 컴포넌트
│   └── ui/                       # shadcn 공통 UI
│
├── lib/
│   ├── settlement/               # 정산 로직 (calculator, excel-parser, auth, api)
│   ├── api/                      # 일반 API 클라이언트
│   ├── store/                    # Zustand 스토어
│   ├── types/                    # TypeScript 타입 정의
│   ├── supabase/                 # Supabase 클라이언트
│   └── image-generation/         # AI 이미지 생성 (Gemini, SeedDream)
│
├── migrations/                   # DB 마이그레이션 SQL
├── scripts/                      # 유틸 스크립트 (시딩, 정산계산 등)
└── docs/                         # 문서 (엑셀 샘플 등)
```

### RS 정산 모듈 상세

**페이지** (`app/accounting/settlement/`)
| 경로 | 설명 |
|------|------|
| `/` (page.tsx) | 대시보드 — 총매출, 정산합계, 작품/파트너 수 |
| `/works` | 작품 목록 |
| `/works/[id]` | 작품 상세 (매출, 파트너 연결) |
| `/partners` | 파트너 목록 |
| `/partners/[id]` | 파트너 상세 (계약작품, 월별추이, 정산서, MG이력) |
| `/partners/[id]/statement` | 파트너 정산서 (인쇄용) |
| `/settlements` | 수익정산금 집계 + RS검증 뷰 |
| `/contracts` | 계약 테이블 (전체 작품-파트너 계약현황) |
| `/mg` | MG현황 (잔액, 추가/차감 이력) |
| `/verification` | RS검증 (산출분배금 vs DB비교) |
| `/upload` | 매출 엑셀 업로드 |
| `/guide` | 서비스 설명서 |

**API** (`app/api/accounting/settlement/`)
| 엔드포인트 | 설명 |
|------------|------|
| `revenue/` | 매출 CRUD |
| `upload/` | 엑셀 업로드 (파싱+저장) |
| `calculate/` | 정산 자동계산 실행 |
| `settlements/` | 정산 결과 조회 |
| `settlement-summary/` | 파트너별 집계 (세금, 예고료, MG차감) |
| `verification/` | RS검증 데이터 |
| `export/` | 엑셀 내보내기 (6종) |
| `partners/`, `partners/[id]/` | 파트너 CRUD |
| `partners/[id]/statement/` | 파트너 정산서 데이터 |
| `works/`, `works/[id]/` | 작품 CRUD |
| `work-partners/` | 작품-파트너 연결 관리 |
| `mg/` | MG 잔액 관리 |

**핵심 로직** (`lib/settlement/`)
| 파일 | 설명 |
|------|------|
| `calculator.ts` | 세금계산(10원절사), 예고료, RS정산 공식 |
| `excel-parser.ts` | 매출 엑셀 파싱 (수익유형별) |
| `auth.ts` | 정산 API 인증 헬퍼 |
| `api.ts` | 클라이언트 fetch 래퍼 |

**DB 테이블** (Supabase)
| 테이블 | 설명 |
|--------|------|
| `rs_works` | 작품 마스터 |
| `rs_partners` | 파트너 (작가/사업자) |
| `rs_work_partners` | 작품-파트너 계약 (RS요율, MG요율, 계약기간 등) |
| `rs_revenues` | 월별 매출 (수익유형 5종) |
| `rs_settlements` | 정산 결과 |
| `rs_mg_balances` | MG 잔액 이력 |
| `rs_revenue_uploads` | 업로드 이력 |

**정산 계산 공식**
```
수익분배금 = 매출 × RS요율
수익정산금 = 수익분배금 - 제작비 + 조정
세금 = calculateTax(수익정산금, 파트너유형)  // 10원 미만 절사
  - 개인: 소득세 3% + 지방세(소득세×10%)
  - 국내사업자: 부가세 10% (별도)
  - 해외사업자: 소득세 20% + 지방세(소득세×10%)
예고료 = floor(수익정산금 × 0.75 × 0.008)  // 개인만
MG차감 = min(MG잔액, max(0, 세후금액))
최종지급 = 수익정산금 - 세액 - 예고료 - MG차감
```

---

## 변경이력

> 최신순. 커밋 해시 + 한줄 요약. 세부 사항은 `git show <hash>` 참조.

### 2026-02-26
- (uncommitted) **정산 페이지 모바일 최적화**
  - 19컬럼 집계/13컬럼 검증/12컬럼 MG → 모바일 카드 레이아웃 (`md:hidden` / `hidden md:block`)
  - 작품·파트너·정산·매출 목록 → `hidden md:table-cell`로 비필수 컬럼 숨김
  - 상세 페이지(works/[id], partners/[id], statement) 컬럼 숨김
  - SettlementHeader flex-col, SettlementNav text-xs, 전 페이지 p-3 md:p-6
  - 수정 파일 15개, 데스크톱 레이아웃 변경 없음

- `cd78905` **정산 Excel 탭별 차이 해소 + 서비스 설명서 페이지**
  - settlement-summary API에 calculateTax(10원절사) 적용
  - 예고료(고용보험) 계산 추가: `calculateInsurance()` in calculator.ts
  - 수익정산금 집계에 예고료/특이사항 컬럼 추가
  - RS검증에 MG요율 컬럼 추가
  - 정산서에 MG 전체 이력 접기/펼치기 추가
  - 엑셀 내보내기에 예고료 컬럼 반영
  - `/accounting/settlement/guide` 서비스 설명서 신규 생성

- `c2cb913` **정산 UI 구조 개편 — 탭 통합, 상세 페이지 분리**
  - 기존 탭 기반 UI를 대시보드+개별 페이지 구조로 변경
  - 파트너 상세 페이지에 정산서/MG/계약정보 통합
  - 작품 상세 페이지에 매출/파트너 연결 통합

### 2026-02-16
- `fed7587` ~ `1d2af6d` 업로드 이력 UI 개선 (파일명 표시, 드롭존 하단 배치)
- `421d0e8` 매출/파트너/작품 페이지에 즉시검색 필터 추가
- `a834323` 파트너별 수익을 파트너 페이지에 통합 + 정산서 뷰 추가
- `a9588cd` 업로드를 네비 탭에서 헤더 다이얼로그로 이동
- `def2bd4` 경영진(executive) 역할 추가 (열람 전용)
- `b95dc44` 업로드 폼을 수익유형별 카드로 분리
- `650106c` ~ `c280583` 엑셀 파서 버그 수정 (국내유료/광고/관리 등)
- `22e007e` **RS 정산 시스템 최초 구현** (전체 모듈)

### 2026-02-13
- `100b40f` ~ `03359f2` 회계 시스템 UI/API/DB 3단계 구축

### 2026-01-14 ~ 2026-01-16
- 자유창작 기능, ComfyUI 연동, 괴수생성기 V2

### 2026-01-03 ~ 2026-01-09
- script-to-movie, 컷 설명/목록 개선, 괴수생성기 스타일 추가

### 2025-12
- script-to-shorts, 캐릭터 관리 폴더, 파일 페이지네이션, 비밀번호 재설정
- 대본to콘티 직접편집 모드, Veo API Key 지원, 쇼츠 생성

---

## 작업 규칙

- **빌드 확인**: 코드 수정 후 반드시 `npx next build` 성공 확인
- **커밋 메시지**: `feat:`, `fix:`, `refactor:` 접두사 사용
- **배포**: main push → Vercel 자동배포
- **정산 계산**: 매출 업로드 또는 계약 수정 후 '정산 계산' 실행 필요
- **권한**: `canViewAccounting` (열람), `canManageAccounting` (수정) 체크 필수
