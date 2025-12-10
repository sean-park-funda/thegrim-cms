# 더그림 작업관리 시스템

웹툰 제작 과정에서 발생하는 다양한 파일들을 체계적으로 관리하고, AI를 활용한 이미지 분석 및 재생성 기능을 제공하는 작업관리 시스템입니다.

## 🚀 빠른 시작

### 필수 요구사항

- Node.js 18 이상
- npm, yarn, pnpm, 또는 bun
- Supabase 계정
- Google Gemini API 키 (선택사항 - AI 기능 사용 시)

### 설치 및 실행

1. **의존성 설치**
```bash
npm install
# or
yarn install
# or
pnpm install
```

2. **환경 변수 설정**

`.env.local` 파일을 생성하고 다음 변수를 설정하세요:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
GEMINI_API_KEY=your-gemini-api-key  # AI 기능 사용 시
```

3. **개발 서버 실행**

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

4. **브라우저에서 확인**

[http://localhost:3000](http://localhost:3000)에서 애플리케이션을 확인할 수 있습니다.

## 📚 문서

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 프로젝트 구조 및 아키텍처 참조 문서
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - 개발 진행 상황 및 계획
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 주요 시스템 상세 설계 (인증, 이미지 메타데이터, 컴포넌트 아키텍처, AI 이미지 재생성)
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - 환경 설정 및 초기 설정 가이드

## 🛠️ 기술 스택

- **프레임워크**: Next.js 16 (App Router)
- **언어**: TypeScript
- **스타일링**: Tailwind CSS
- **UI 컴포넌트**: shadcn/ui
- **상태 관리**: Zustand
- **데이터베이스**: Supabase (PostgreSQL)
- **스토리지**: Supabase Storage
- **인증**: Supabase Auth
- **AI**: Google Gemini API (2.5 Pro, 2.5 Flash Image)
- **아이콘**: Lucide Icons

## ✨ 주요 기능

- **웹툰 관리**: 웹툰, 회차, 컷 단위로 파일 관리
- **공정별 관리**: 공정별로 파일을 그룹화하여 관리
- **파일 업로드**: 
  - 드래그 앤 드롭 업로드
  - 파일 선택 다이얼로그 업로드
  - 클립보드 붙여넣기 업로드 (Ctrl+V / Cmd+V) - 화면 캡처 이미지 지원
- **파일 검색**: 파일명, 설명, 메타데이터 기반 검색
- **AI 이미지 분석**: Gemini API를 활용한 자동 메타데이터 생성
- **AI 이미지 재생성**: 다양한 스타일로 이미지 재생성
- **권한 관리**: 역할 기반 접근 제어 (admin, manager, staff, viewer)
- **사용자 초대**: 관리자 초대 시스템

## 📖 참고 자료

### 공식 문서
- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [Supabase Auth 문서](https://supabase.com/docs/guides/auth)
- [Supabase RLS 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [Gemini API 문서](https://ai.google.dev/docs)
- [shadcn/ui 문서](https://ui.shadcn.com)
- [Zustand 문서](https://zustand-demo.pmnd.rs)
- [Tailwind CSS 문서](https://tailwindcss.com/docs)

### 유용한 링크
- [Google AI Studio](https://makersuite.google.com/app/apikey) - Gemini API 키 발급
- [react-dropzone 문서](https://react-dropzone.js.org)

## 🚀 배포

### Vercel 배포

가장 쉬운 방법은 [Vercel Platform](https://vercel.com/new)을 사용하는 것입니다.

1. GitHub 저장소를 Vercel에 연결
2. 환경 변수 설정
3. 배포 완료

자세한 내용은 [Next.js 배포 문서](https://nextjs.org/docs/app/building-your-application/deploying)를 참고하세요.

## 📝 라이선스

이 프로젝트는 비공개 프로젝트입니다.
