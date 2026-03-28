-- 전선욱: 3개 MG 풀을 1개로 합치기
-- 인생존망 풀(bd60e27a)에 인생존망2, 얼짱시대 작품 추가

-- 1. 인생존망 풀 이름 변경
UPDATE rs_mg_pools
SET name = '전선욱 MG', updated_at = now()
WHERE id = 'bd60e27a-0dad-4818-bdac-317636fc494a';

-- 2. 인생존망2 작품을 인생존망 풀에 연결 (기존 풀에서 이동)
INSERT INTO rs_mg_pool_works (mg_pool_id, work_id, mg_rs_rate)
VALUES ('bd60e27a-0dad-4818-bdac-317636fc494a', '5507dc9e-782e-4c94-9a78-41efa812c1b5', 0.35)
ON CONFLICT (mg_pool_id, work_id) DO NOTHING;

-- 3. 얼짱시대 작품을 인생존망 풀에 연결
INSERT INTO rs_mg_pool_works (mg_pool_id, work_id, mg_rs_rate)
VALUES ('bd60e27a-0dad-4818-bdac-317636fc494a', 'f4e6503e-096b-4c85-8b16-7b80fff95cb2', 0.1)
ON CONFLICT (mg_pool_id, work_id) DO NOTHING;

-- 4. rs_work_partners의 mg_pool_id 업데이트 (인생존망2, 얼짱시대 → 인생존망 풀)
UPDATE rs_work_partners
SET mg_pool_id = 'bd60e27a-0dad-4818-bdac-317636fc494a'
WHERE partner_id = 'c54620f0-fcd1-4953-af1c-c6005d7bd8e8'
  AND work_id IN ('5507dc9e-782e-4c94-9a78-41efa812c1b5', 'f4e6503e-096b-4c85-8b16-7b80fff95cb2');

-- 5. 기존 빈 풀의 pool_works 삭제
DELETE FROM rs_mg_pool_works
WHERE mg_pool_id IN ('0171c0d8-5aa6-431e-a7f7-8dc513ebd798', '95e7ec6d-42df-4c3d-a682-f1fec2c98e35');

-- 6. 빈 풀 삭제 (잔액 이력도 없으므로 cascade)
DELETE FROM rs_mg_pools
WHERE id IN ('0171c0d8-5aa6-431e-a7f7-8dc513ebd798', '95e7ec6d-42df-4c3d-a682-f1fec2c98e35');
