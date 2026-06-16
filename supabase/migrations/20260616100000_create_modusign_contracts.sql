-- 모두싸인 전자계약 대시보드
-- 모두싸인 API에서 수집한 계약 메타데이터 + Claude API PDF 분석 결과 저장

CREATE TABLE modusign_contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         text UNIQUE NOT NULL,       -- 모두싸인 문서 고유 ID
  title               text,                       -- 계약서명
  category            text,                       -- 웹툰/굿즈/카페/인사/총무/자금/이사회주총/기타
  status              text,                       -- COMPLETED/REQUESTED/DECLINED/EXPIRED
  classification      text,                       -- 매출/매입

  -- 모두싸인 직접 수집
  sent_at             timestamptz,                -- 발송 일시 (createdAt)
  completed_at        timestamptz,                -- 체결 일시 (finishedAt)
  participants        jsonb,                      -- 서명자 목록
  labels              jsonb,                      -- 모두싸인 라벨

  -- PDF 분석 결과 (Claude API)
  counterparty        text,                       -- 거래처
  contract_start      date,
  contract_end        date,
  total_amount        bigint,                     -- 총 계약금 (원)
  prepayment          bigint,                     -- 선금
  prepayment_due      date,
  interim_payment     bigint,                     -- 중도금
  interim_due         date,
  balance_payment     bigint,                     -- 잔금
  balance_due         date,
  settlement_ratio    numeric(5,4),               -- 정산비율 (0.0000~1.0000)
  settlement_method   text,                       -- 정산방식
  settlement_date     text,                       -- 정산일/지급일
  summary             text,                       -- 계약사항 요약
  special_terms       text,                       -- 특약 등

  -- 관리
  pdf_analyzed        boolean DEFAULT false,
  pdf_analyzed_at     timestamptz,
  raw_modusign        jsonb,                      -- 모두싸인 원본 응답
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 자주 쓰는 필터 인덱스
CREATE INDEX idx_modusign_contracts_status     ON modusign_contracts (status);
CREATE INDEX idx_modusign_contracts_category   ON modusign_contracts (category);
CREATE INDEX idx_modusign_contracts_completed  ON modusign_contracts (completed_at DESC NULLS LAST);
CREATE INDEX idx_modusign_contracts_analyzed   ON modusign_contracts (pdf_analyzed) WHERE pdf_analyzed = false;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_modusign_contracts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modusign_contracts_updated_at
  BEFORE UPDATE ON modusign_contracts
  FOR EACH ROW EXECUTE FUNCTION update_modusign_contracts_updated_at();

-- RLS: 서비스롤만 접근 (일반 사용자 직접 접근 차단)
ALTER TABLE modusign_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON modusign_contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
