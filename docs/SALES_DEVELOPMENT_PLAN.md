# 매출 섹션 개발 계획

> 기획안: "작품 정보 및 매출 관리 시스템 사이트 구성 기획안"
> 작성일: 2026-03-20

---

## 현재 구현 현황

### 매출 섹션 (Sales)
| 페이지 | 상태 | 설명 |
|--------|------|------|
| 대시보드 (`/sales`) | ✅ 완료 | 일별 매출 차트, 기간 선택 |
| 작품별 매출 (`/sales/works`) | ✅ 완료 | 작품 목록 + 일별/월별 매출 |
| 작품 상세 (`/sales/works/[id]`) | ✅ 완료 | 요약 카드, 일별 바 차트, 월별 테이블 |
| 랭킹 (`/sales/ranking`) | ✅ 완료 | 작품 매출 순위 |
| 성장 분석 (`/sales/growth`) | ✅ 완료 | 매출 성장 추이 |
| AI 챗 (`/sales/chat`) | ✅ 완료 | 매출 데이터 AI 검색 |

### 정산 섹션 (Settlement) — 이미 존재하는 관련 기능
| 기능 | 위치 | 비고 |
|------|------|------|
| 작품 기본 정보 관리 | `/settlement/works/[id]` | name, naver_name, 계약형태, 연재일 |
| 파트너/작가 관리 | `/settlement/partners` | 작가, 세율, 은행 정보 등 |
| **해외 매출 (global_paid, global_ad)** | `rs_revenues` 테이블 | 월별 5개 매출 유형으로 이미 추적 중 |
| 엑셀 업로드 | `/settlement/upload` | 해외 매출 포함, 파서 구현 완료 |
| 매출 유형별 정산 | 정산 계산 로직 | domestic_paid, global_paid, domestic_ad, global_ad, secondary |
| 외국 파트너 처리 | `is_foreign`, `foreign_corp` | 별도 세율 적용 (22%) |

---

## 기획안 vs 현재 상태 Gap 분석

### 1. 작품 정보 관리

#### 1-1. 기본 정보 확장 (rs_works 테이블)
기획안 요구사항: 작품명, 작가정보, 레이블, 연재상태, 개시일, 종료일, 플랫폼, 에피소드 수, 장르, 로그라인, 엘리먼트, 주요 이미지

| 필드 | 현재 | 필요 작업 |
|------|------|-----------|
| name, naver_name | ✅ 있음 | - |
| contract_type | ✅ 있음 | - |
| serial_start/end_date | ✅ 있음 | - |
| is_active | ✅ 있음 | - |
| **label** (레이블) | ❌ 없음 | 컬럼 추가 |
| **platform** (연재 플랫폼) | ❌ 없음 | 컬럼 추가 (네이버, 카카오 등) |
| **episode_count** | ❌ 없음 | 컬럼 추가 |
| **genre** | ❌ 없음 | 컬럼 추가 (text[]) |
| **logline** | ❌ 없음 | 컬럼 추가 |
| **element** (엘리먼트) | ❌ 없음 | 컬럼 추가 |
| **thumbnail_url** | ❌ 없음 | 컬럼 추가 |
| 작가정보 | ✅ 파트너로 관리 | 정산 파트너와 연결됨 |

#### 1-2. 해외 론칭 정보 (신규 테이블)
국가별 서비스 현황: 북미, 일본, 대만, 중국, 인도네시아, 프랑스, 독일, 태국

→ **`rs_work_global_launches` 테이블 신설**
```
work_id, country_code, platform_name, url, status, launched_at, note
```

#### 1-3. 2차 사업 정보 (신규 테이블)
유형: 출판, 드라마, 영화, 애니메이션, 그 외 라이선스 / 진행상태

→ **`rs_work_secondary_biz` 테이블 신설**
```
work_id, biz_type, title, status, partner, contract_date, note
```

#### 1-4. 특이사항
→ rs_works에 이미 `note` 컬럼 존재. UI만 개선하면 됨.

### 2. 매출 정보 관리

#### 2-1. 종합 매출 (국내 + 해외 통합 뷰)
- 정산의 `rs_revenues` (월별 국내/해외) + 매출의 `rs_daily_sales` (일별 국내) 통합
- 기간별, 지역별, 작품별 비교 차트
- **주의**: rs_revenues는 월 단위, rs_daily_sales는 일 단위 → 집계 기준 통일 필요

#### 2-2. 국내 매출 강화
현재 일별/월별 조회는 완료. 추가 필요:
- ~~랭킹~~ → ✅ 이미 구현
- 작품간 비교 기능 (2~3개 작품 선택 → 라인 차트 오버레이)
- 필터링: 플랫폼별, 장르별, 작품 태그별
- 주별 집계 뷰

#### 2-3. 해외 매출
- **정산에 이미 엑셀 업로드 + 파서 존재** (global_paid, global_ad)
- 매출 섹션에서는 이 데이터를 **조회/시각화**하는 뷰 추가
- 국가코드별 취합: rs_work_global_launches의 country_code와 연결
- 수기 기입 기능: 간단한 폼 (작품, 국가, 월, 금액)

---

## 개발 우선순위

### Phase 1: 국내 매출 고도화 (현재 데이터 활용)
> 이미 데이터가 있어 바로 가능

1. **작품 비교 기능** — 2~3개 작품 선택 → 매출 추이 비교 차트
2. **필터링 강화** — 장르, 플랫폼, 연재 상태별 필터
3. **주별 집계** — 일별 데이터를 주 단위로 묶어 보기

### Phase 2: 작품 정보 확장
> 기획안의 "작품 정보 관리" 영역

4. **rs_works 컬럼 추가** — label, platform, episode_count, genre, logline, element, thumbnail_url
5. **작품 정보 편집 UI** — 매출 섹션의 작품 상세에서 편집 가능 (정산과 공유)
6. **특이사항(메모) UI 개선** — 마크다운 메모, 이력 표시

### Phase 3: 해외 매출 뷰 + 2차 사업
> 정산 데이터를 매출 섹션에서 시각화

7. **해외 매출 대시보드** — rs_revenues의 global_paid/global_ad를 지역별로 시각화
8. **해외 론칭 정보** — rs_work_global_launches 테이블 + 관리 UI
9. **수기 입력 폼** — 엑셀 외 간단 해외 매출 직접 입력
10. **2차 사업 관리** — rs_work_secondary_biz 테이블 + 관리 UI

### Phase 4: 종합 대시보드
> 모든 데이터가 갖춰진 후

11. **국내+해외 통합 뷰** — 기간/지역/작품별 비교
12. **경영진 리포트** — 핵심 KPI 대시보드 (전체 매출, 성장률, 작품별 수익성)

---

## 아키텍처 참고

### 데이터 흐름
```
[네이버 프렌즈 스크래핑] → rs_daily_sales (일별, 국내)
[엑셀 업로드 (정산)] → rs_revenues (월별, 국내+해외 5개 유형)
[수기 입력 (예정)] → rs_revenues or 별도 테이블

매출 섹션 API → 위 두 소스를 조합하여 조회
```

### 매출 vs 정산 역할 분리
- **매출 섹션**: 데이터 조회, 시각화, 비교 분석 (읽기 중심)
- **정산 섹션**: 데이터 입력, 정산 계산, 파트너 지급 (쓰기 중심)
- **공유**: rs_works, rs_revenues, rs_partners 테이블은 양쪽에서 사용

### 권한
- 매출 조회: admin, executive, accountant, strategy, manager (`canViewSales`)
- 정산 관리: admin, executive, accountant (`canManageAccounting`)
