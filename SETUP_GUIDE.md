# 웹툰 CMS 설정 가이드

이 가이드는 웹툰 제작 공정 관리 CMS를 처음부터 설정하는 방법을 단계별로 안내합니다.

## 📋 사전 준비

- Node.js 18 이상
- npm 또는 yarn
- Supabase 계정

## 🚀 단계별 설정

### 1단계: 프로젝트 클론 및 의존성 설치

\`\`\`bash
# 의존성 설치
npm install
\`\`\`

### 2단계: Supabase 프로젝트 생성

1. [Supabase 웹사이트](https://supabase.com) 접속
2. "Start your project" 클릭
3. 새 프로젝트 생성:
   - Organization 선택 (또는 새로 생성)
   - Project Name 입력 (예: webtoon-cms)
   - Database Password 설정 (안전하게 보관!)
   - Region 선택 (Northeast Asia (Seoul) 권장)
4. "Create new project" 클릭 (약 2분 소요)

### 3단계: API 키 확인

프로젝트 생성 완료 후:

1. 좌측 메뉴에서 **Settings** (톱니바퀴 아이콘) 클릭
2. **API** 메뉴 선택
3. 다음 정보 복사:
   - **Project URL** (예: https://xxxxx.supabase.co)
   - **anon public** key (길고 복잡한 문자열)

### 4단계: 환경 변수 설정

프로젝트 루트 디렉토리에 \`.env.local\` 파일 생성:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# AI 이미지 생성 API 키 (선택사항)
GEMINI_API_KEY=your-gemini-api-key-here
SEEDREAM_API_KEY=your-seedream-api-key-here
SEEDREAM_API_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
\`\`\`

⚠️ **주의**: 실제 값으로 교체하세요!

#### AI 이미지 생성 API 키 발급 방법

**Google Gemini API 키:**
1. [Google AI Studio](https://aistudio.google.com/app/apikey) 접속
2. "Create API Key" 클릭
3. API 키 복사 후 \`GEMINI_API_KEY\`에 설정

**ByteDance Seedream API 키:**
1. [ByteDance ARK](https://www.volcengine.com/product/ark) 접속
2. 계정 생성 및 로그인
3. API 키 발급 (ARK API Key)
4. API 키 복사 후 \`SEEDREAM_API_KEY\`에 설정
5. API Base URL 설정 (기본값: \`https://ark.ap-southeast.bytepluses.com/api/v3\`)
   - 리전에 따라 다를 수 있으므로 ByteDance ARK 문서 확인
   - 필요시 \`SEEDREAM_API_BASE_URL\` 환경 변수로 커스터마이징 가능

**참고:**
- AI 이미지 재생성 기능을 사용하려면 최소한 \`GEMINI_API_KEY\`는 필수입니다.
- Seedream API를 사용하려면 \`SEEDREAM_API_KEY\`도 설정해야 합니다.
- 이미지 생성 개수가 2, 4, 6, 8, ..., 20으로 제한되며, 홀수 인덱스는 Gemini, 짝수 인덱스는 Seedream을 사용합니다.

⚠️ **중요: 프로덕션 환경 변수 설정**

\`.env.local\` 파일은 **로컬 개발 환경에서만** 사용됩니다. 프로덕션 환경에는 적용되지 않습니다!

#### Vercel 배포 시 환경 변수 설정

1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. 프로젝트 선택
3. **Settings** 메뉴 클릭
4. **Environment Variables** 섹션으로 이동
5. 다음 환경 변수들을 추가:

\`\`\`
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
SEEDREAM_API_KEY=your-seedream-api-key-here
SEEDREAM_API_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
\`\`\`

6. 각 환경 변수에 대해 **Environment** 선택:
   - **Production**: 프로덕션 환경
   - **Preview**: 프리뷰/스테이징 환경
   - **Development**: 개발 환경 (일반적으로 사용 안 함)

7. **Save** 클릭

8. 환경 변수 추가 후 **재배포** 필요:
   - Vercel 대시보드에서 **Deployments** 탭
   - 최신 배포의 **⋯** 메뉴 → **Redeploy** 클릭

#### 다른 플랫폼 배포 시

- **Netlify**: Site settings → Environment variables
- **AWS/EC2**: 서버의 환경 변수 설정 또는 \`.env.production\` 파일 사용
- **Docker**: \`docker-compose.yml\` 또는 컨테이너 환경 변수 설정
- **기타**: 해당 플랫폼의 환경 변수 설정 방법 참고

**보안 주의사항:**
- 환경 변수는 절대 Git에 커밋하지 마세요 (이미 \`.gitignore\`에 포함됨)
- 프로덕션 API 키는 안전하게 관리하세요
- 필요시 환경별로 다른 API 키 사용 권장

### 5단계: 데이터베이스 스키마 생성

1. Supabase 대시보드에서 **SQL Editor** 클릭
2. "New query" 클릭
3. 프로젝트의 \`supabase-schema.sql\` 파일 열기
4. 전체 내용 복사
5. SQL Editor에 붙여넣기
6. **RUN** 버튼 클릭
7. "Success. No rows returned" 메시지 확인

### 6단계: Storage Bucket 생성

1. 좌측 메뉴에서 **Storage** 클릭
2. **New bucket** 버튼 클릭
3. 다음 정보 입력:
   - Name: \`webtoon-files\`
   - ✅ Public bucket 체크
4. **Create bucket** 클릭
5. 생성된 버킷 확인

### 7단계: Storage 정책 설정 (선택사항)

개발 단계에서는 모든 사용자가 파일에 접근할 수 있도록 설정:

1. Storage 페이지에서 \`webtoon-files\` 버킷 선택
2. **Policies** 탭 클릭
3. **New Policy** 클릭
4. "Public access" 템플릿 선택
5. 다음 정책 추가:

**SELECT (읽기)**:
\`\`\`sql
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'webtoon-files' );
\`\`\`

**INSERT (업로드)**:
\`\`\`sql
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'webtoon-files' );
\`\`\`

**DELETE (삭제)**:
\`\`\`sql
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'webtoon-files' );
\`\`\`

### 8단계: 개발 서버 실행

\`\`\`bash
npm run dev
\`\`\`

브라우저에서 http://localhost:3000 접속

## ✅ 설정 확인

### 데이터베이스 확인

Supabase 대시보드 > **Table Editor**에서 다음 테이블이 생성되었는지 확인:
- ✅ webtoons
- ✅ episodes
- ✅ cuts
- ✅ processes
- ✅ files

\`processes\` 테이블에 6개의 기본 공정이 추가되어 있어야 합니다.

### Storage 확인

Supabase 대시보드 > **Storage**에서 \`webtoon-files\` 버킷이 있는지 확인

## 🎯 첫 데이터 추가

### 1. 웹툰 추가

Supabase 대시보드 > **Table Editor** > **webtoons** > **Insert row**:

\`\`\`json
{
  "title": "테스트 웹툰",
  "description": "첫 번째 웹툰입니다",
  "status": "active"
}
\`\`\`

### 2. 회차 추가

**episodes** 테이블 > **Insert row**:

\`\`\`json
{
  "webtoon_id": "[방금 생성한 웹툰의 id]",
  "episode_number": 1,
  "title": "1화",
  "status": "in_progress"
}
\`\`\`

### 3. 컷 추가

**cuts** 테이블 > **Insert row**:

\`\`\`json
{
  "episode_id": "[방금 생성한 회차의 id]",
  "cut_number": 1,
  "title": "첫 번째 컷"
}
\`\`\`

### 4. 웹 앱에서 확인

http://localhost:3000 에서 방금 추가한 웹툰/회차/컷이 보이는지 확인!

## 🔧 문제 해결

### "Invalid API key" 오류

- \`.env.local\` 파일이 프로젝트 루트에 있는지 확인
- API 키가 정확히 복사되었는지 확인
- 개발 서버 재시작: Ctrl+C 후 \`npm run dev\` 다시 실행

### "Bucket not found" 오류

- Supabase Storage에서 \`webtoon-files\` 버킷 생성 확인
- 버킷 이름이 정확한지 확인 (하이픈 포함)

### 테이블이 없다는 오류

- SQL Editor에서 \`supabase-schema.sql\` 스크립트가 성공적으로 실행되었는지 확인
- Table Editor에서 테이블 목록 확인

### 파일 업로드 실패

- Storage 정책이 올바르게 설정되었는지 확인
- 버킷이 Public으로 설정되어 있는지 확인

## 📚 다음 단계

설정이 완료되었다면:

1. ✅ 웹툰별 뷰에서 데이터 탐색
2. ✅ 공정별 뷰로 전환해보기
3. ✅ 검색 기능 테스트
4. 📝 파일 업로드 기능 구현 (향후 개발)

## 💡 팁

- **개발 중**: RLS(Row Level Security) 비활성화 상태 유지
- **프로덕션**: 인증 시스템 구현 후 RLS 활성화 필수
- **백업**: Supabase 대시보드에서 정기적으로 데이터베이스 백업
- **모니터링**: Supabase 대시보드의 Logs 메뉴에서 API 요청 모니터링

## 🆘 도움이 필요하신가요?

- [Supabase 공식 문서](https://supabase.com/docs)
- [Next.js 공식 문서](https://nextjs.org/docs)
- 프로젝트 Issues 탭에서 질문하기


