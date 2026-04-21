-- Revert: set all back to NULL (default = all 5 types)
-- EXCEPT the 3 that were already correctly set before (유호빈 외모지상주의/싸움독학/인생존망)
UPDATE rs_work_partners
SET included_revenue_types = NULL
WHERE included_revenue_types IS NOT NULL;

-- Re-set the 3 that were originally correct
-- 유호빈 / 외모지상주의
UPDATE rs_work_partners SET included_revenue_types = ARRAY['domestic_paid','global_paid']
WHERE partner_id = '441c13fa-ffa5-4355-a316-77a0744f60eb'
  AND work_id = (SELECT id FROM rs_works WHERE name = '외모지상주의');

-- 유호빈 / 싸움독학
UPDATE rs_work_partners SET included_revenue_types = ARRAY['domestic_paid','global_paid']
WHERE partner_id = '441c13fa-ffa5-4355-a316-77a0744f60eb'
  AND work_id = (SELECT id FROM rs_works WHERE name = '싸움독학');

-- 유호빈 / 인생존망
UPDATE rs_work_partners SET included_revenue_types = ARRAY['domestic_paid','global_paid']
WHERE partner_id = '441c13fa-ffa5-4355-a316-77a0744f60eb'
  AND work_id = (SELECT id FROM rs_works WHERE name = '인생존망');
