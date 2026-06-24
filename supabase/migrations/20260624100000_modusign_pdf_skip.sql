-- pdf_skip: 영구 분석 제외 플래그 (비밀번호 보호, 손상 불가복구 등)
ALTER TABLE modusign_contracts
  ADD COLUMN IF NOT EXISTS pdf_skip boolean DEFAULT false;

COMMENT ON COLUMN modusign_contracts.pdf_skip IS '영구 분석 불가 계약 제외 플래그 (비밀번호 보호, 손상 불가복구 등). true이면 daily 재분석 릴레이에서 제외됨.';
