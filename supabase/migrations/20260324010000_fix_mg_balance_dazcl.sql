-- 한큰빛(다즐코믹스)/VS MG 잔액 보정
-- 엑셀 이전잔액: 164,529,900 / CMS: 220,570,069
UPDATE rs_mg_balances SET previous_balance = 164529900, current_balance = previous_balance + mg_added - mg_deducted WHERE id = 'f33af6e0-e19f-4154-8a52-4c7fae3878ca';
