#!/bin/bash
# 모두싸인 일일 자동 동기화 래퍼
# 1) modusign-sync.mjs       : 계약 목록 동기화 (upsert)
# 2) modusign-pdf-download.mjs: 신규 완료 계약 PDF 저장 (미저장분만, 최대 3회 재시도)
# 3) Slack #회계시스템개발 에 결과 요약 전송
# launchd(com.petervoice.modusign-daily)에서 매일 오전 6시 실행

set -uo pipefail

PROJECT_DIR="/Users/sean/Projects/thegrim-cms"
NODE="/opt/homebrew/bin/node"
SYNC_DIR="$HOME/.modusign-sync"
LOG_DIR="$SYNC_DIR/logs"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"
source "$SYNC_DIR/secrets.env" 2>/dev/null || true

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_DIR" || { log "프로젝트 디렉토리 없음"; exit 1; }

# ── DB 카운트 헬퍼 (python3) ───────────────────────
count() {
  # $1: PostgREST 필터 (빈 문자열이면 전체)
  python3 - "$1" <<'PY'
import sys, urllib.request
filt = sys.argv[1]
env = {}
for l in open('/Users/sean/Projects/thegrim-cms/.env.local'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = env.get('NEXT_PUBLIC_SUPABASE_URL') or env.get('SUPABASE_URL')
key  = env.get('SUPABASE_SERVICE_ROLE_KEY')
u = f"{base}/rest/v1/modusign_contracts?select=id" + (("&" + filt) if filt else "")
req = urllib.request.Request(u, headers={"apikey": key, "Authorization": f"Bearer {key}",
                                         "Prefer": "count=exact", "Range": "0-0"})
print(urllib.request.urlopen(req).headers.get('content-range').split('/')[-1])
PY
}

# ── Slack 전송 헬퍼 ───────────────────────────────
slack() {
  local text="$1"
  [ -z "${SLACK_BOT_TOKEN:-}" ] && { log "SLACK_BOT_TOKEN 없음 — 전송 생략"; return; }
  python3 - "$text" <<'PY'
import sys, os, json, urllib.request
text = sys.argv[1]
tok = os.environ['SLACK_BOT_TOKEN']
ch  = os.environ.get('SLACK_ACCOUNTING_CHANNEL', 'C0AJHP6V325')
data = json.dumps({"channel": ch, "text": text}).encode()
req = urllib.request.Request("https://slack.com/api/chat.postMessage", data=data,
    headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=utf-8"})
r = json.load(urllib.request.urlopen(req))
print("slack ok" if r.get("ok") else f"slack err: {r.get('error')}")
PY
}

# ══════════════════════════════════════════════════
log "=== 모두싸인 일일 동기화 시작 ==="
TOTAL_BEFORE=$(count "")
log "동기화 전 전체 계약: ${TOTAL_BEFORE}건"

# 1) 계약 목록 동기화
log "[1/2] 계약 목록 동기화..."
if ! "$NODE" scripts/modusign-sync.mjs >> "$LOG_FILE" 2>&1; then
  log "동기화 실패"
  slack "⚠️ 모두싸인 동기화 실패 — 목록 동기화 단계. 로그: $LOG_FILE"
  exit 1
fi
TOTAL_AFTER=$(count "")
NEW_CONTRACTS=$(( TOTAL_AFTER - TOTAL_BEFORE ))
log "동기화 후 전체 계약: ${TOTAL_AFTER}건 (신규 ${NEW_CONTRACTS}건)"

# 2) PDF 다운로드 (미저장분만, 진전 없을 때까지 최대 3회)
log "[2/2] PDF 다운로드..."
REMAIN_BEFORE=$(count "status=eq.COMPLETED&pdf_storage_path=is.null")
log "PDF 미저장(완료계약): ${REMAIN_BEFORE}건"
PREV=$REMAIN_BEFORE
for i in 1 2 3; do
  [ "$PREV" -eq 0 ] && break
  log "  PDF 다운로드 시도 ${i}회..."
  "$NODE" scripts/modusign-pdf-download.mjs >> "$LOG_FILE" 2>&1
  CUR=$(count "status=eq.COMPLETED&pdf_storage_path=is.null")
  log "  → 잔여 ${CUR}건"
  [ "$CUR" -ge "$PREV" ] && { log "  진전 없음 — 재시도 중단"; PREV=$CUR; break; }
  PREV=$CUR
done
REMAIN_AFTER=$PREV
PDF_SAVED=$(( REMAIN_BEFORE - REMAIN_AFTER ))

# 3) AI 상세분석 (거래처/계약금/특약 등 추출, 미분석분만, 진전 없을 때까지 최대 3회)
log "[3/3] AI 상세분석(gpt-4.1)..."
ANALYZE_FILTER="status=eq.COMPLETED&or=(pdf_analyzed.is.null,pdf_analyzed.eq.false)"
ANALYZE_BEFORE=$(count "$ANALYZE_FILTER")
log "미분석(완료계약): ${ANALYZE_BEFORE}건"
APREV=$ANALYZE_BEFORE
for i in 1 2 3; do
  [ "$APREV" -eq 0 ] && break
  log "  분석 시도 ${i}회..."
  "$NODE" scripts/modusign-pdf-analyze.mjs >> "$LOG_FILE" 2>&1
  ACUR=$(count "$ANALYZE_FILTER")
  log "  → 미분석 ${ACUR}건"
  [ "$ACUR" -ge "$APREV" ] && { log "  진전 없음 — 재시도 중단"; APREV=$ACUR; break; }
  APREV=$ACUR
done
ANALYZE_AFTER=$APREV
ANALYZED=$(( ANALYZE_BEFORE - ANALYZE_AFTER ))

# ── 결과 요약 ─────────────────────────────────────
log "=== 완료 — 신규계약 ${NEW_CONTRACTS} / PDF저장 ${PDF_SAVED} / 분석 ${ANALYZED} / 미분석잔여 ${ANALYZE_AFTER} ==="
slack "✅ 모두싸인 동기화 완료 ($(date '+%m/%d'))
• 신규 계약: ${NEW_CONTRACTS}건 (전체 ${TOTAL_AFTER}건)
• PDF 신규 저장: ${PDF_SAVED}건 (미저장 잔여 ${REMAIN_AFTER}건)
• AI 상세분석: ${ANALYZED}건 (미분석 잔여 ${ANALYZE_AFTER}건)"

# 오래된 로그 정리 (30일)
find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
