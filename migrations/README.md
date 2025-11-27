# 데이터베이스 마이그레이션

이 디렉토리는 데이터베이스 스키마 변경을 위한 SQL 마이그레이션 파일을 포함합니다.

## 마이그레이션 실행 방법

### Supabase 대시보드 사용

1. [Supabase 대시보드](https://app.supabase.com)에 로그인
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. **New query** 버튼 클릭
5. 마이그레이션 파일의 내용을 복사하여 붙여넣기
6. **Run** 버튼 클릭

### Supabase CLI 사용 (선택사항)

```bash
supabase db push
```

## 마이그레이션 파일 목록

### `add-reference-files.sql`

**날짜**: 2025-11-27  
**설명**: 웹툰 레퍼런스 파일 업로드 기능 추가

**변경 사항**:
- `reference_files` 테이블 생성
- 인덱스 추가 (`webtoon_id`, `process_id`)
- `updated_at` 자동 업데이트 트리거 추가

**의존성**: 
- `webtoons` 테이블 존재
- `processes` 테이블 존재
- `update_updated_at_column()` 함수 존재

**롤백 방법**:
```sql
DROP TABLE IF EXISTS reference_files CASCADE;
```

## 주의사항

- 마이그레이션 실행 전 데이터베이스 백업 권장
- 프로덕션 환경에서는 테스트 환경에서 먼저 실행 후 적용
- 마이그레이션 실패 시 롤백 SQL 실행
