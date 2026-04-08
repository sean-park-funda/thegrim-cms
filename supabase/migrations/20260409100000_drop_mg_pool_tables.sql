-- Drop MG pool system tables (replaced by rs_mg_entries + rs_mg_entry_works + rs_mg_deductions)
-- Data was migrated in prior step; all code references removed.

-- Remove FK reference from rs_work_partners
ALTER TABLE rs_work_partners DROP CONSTRAINT IF EXISTS rs_work_partners_mg_pool_id_fkey;
ALTER TABLE rs_work_partners DROP COLUMN IF EXISTS mg_pool_id;

-- Drop pool tables in dependency order
DROP TABLE IF EXISTS rs_mg_pool_balances;
DROP TABLE IF EXISTS rs_mg_pool_works;
DROP TABLE IF EXISTS rs_mg_pools;
