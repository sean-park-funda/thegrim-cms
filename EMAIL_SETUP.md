# 이메일 자동 전송 설정 가이드

초대 이메일 자동 전송 기능을 사용하려면 Resend API 키를 설정해야 합니다.

## 1. Resend 계정 생성

1. [Resend 웹사이트](https://resend.com) 접속
2. "Get Started" 클릭하여 계정 생성
3. 무료 플랜으로 시작 (월 3,000개 이메일 무료)

## 2. API 키 발급

1. Resend 대시보드에서 **API Keys** 메뉴 클릭
2. **Create API Key** 버튼 클릭
3. API 키 이름 입력 (예: "Webtoon CMS")
4. 권한 선택: **Sending access** 선택
5. **Add** 클릭
6. 생성된 API 키 복사 (한 번만 표시되므로 안전하게 보관!)

## 3. 도메인 설정 (선택사항)

### 방법 1: Resend 기본 도메인 사용 (테스트용)
- Resend가 제공하는 기본 도메인 사용
- 예: `onboarding@resend.dev`
- 제한: 받는 사람이 이메일을 받을 수 있지만 스팸으로 분류될 수 있음

### 방법 2: 커스텀 도메인 설정 (프로덕션용)
1. Resend 대시보드에서 **Domains** 메뉴 클릭
2. **Add Domain** 클릭
3. 도메인 입력 (예: `yourdomain.com`)
4. DNS 레코드 추가 (Resend가 제공하는 DNS 레코드를 도메인에 추가)
5. 인증 완료 대기 (보통 몇 분 소요)

## 4. Supabase Edge Function 환경 변수 설정

1. Supabase 대시보드 접속
2. 프로젝트 선택
3. 좌측 메뉴에서 **Edge Functions** 클릭
4. **send-invitation-email** 함수 선택
5. **Settings** 탭 클릭
6. **Secrets** 섹션에서 다음 환경 변수 추가:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**참고:**
- `RESEND_API_KEY`: Resend에서 발급받은 API 키
- `RESEND_FROM_EMAIL`: 발신자 이메일 주소 (기본 도메인 사용 시 `onboarding@resend.dev` 또는 커스텀 도메인 사용)

## 5. 테스트

1. 관리자 페이지에서 새 초대 생성
2. 초대받은 이메일 주소로 이메일이 자동으로 전송되는지 확인
3. 이메일의 초대 링크를 클릭하여 회원가입 페이지로 이동하는지 확인

## 문제 해결

### 이메일이 전송되지 않는 경우

1. **Supabase Edge Function 로그 확인**
   - Supabase 대시보드 → Edge Functions → send-invitation-email → Logs
   - 에러 메시지 확인

2. **Resend API 키 확인**
   - Resend 대시보드에서 API 키가 활성화되어 있는지 확인
   - API 키 권한이 "Sending access"인지 확인

3. **도메인 인증 확인**
   - 커스텀 도메인을 사용하는 경우 도메인이 인증되었는지 확인
   - Resend 대시보드 → Domains에서 상태 확인

4. **환경 변수 확인**
   - Supabase Edge Function의 Secrets에 환경 변수가 올바르게 설정되었는지 확인
   - 변수 이름이 정확한지 확인 (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`)

### 이메일이 스팸으로 분류되는 경우

- 커스텀 도메인을 사용하세요
- SPF, DKIM, DMARC 레코드를 올바르게 설정하세요
- Resend의 도메인 인증 가이드를 따르세요

## 비용

- **Resend 무료 플랜**: 월 3,000개 이메일 무료
- **초과 시**: $20/월 (50,000개 이메일)
- 대부분의 경우 무료 플랜으로 충분합니다

## 보안 주의사항

- API 키는 절대 공개 저장소에 커밋하지 마세요
- Supabase Secrets에만 저장하세요
- API 키가 유출된 경우 즉시 Resend에서 재발급하세요







