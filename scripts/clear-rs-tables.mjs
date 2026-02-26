import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const tables = [
  'rs_settlements',
  'rs_mg_balances',
  'rs_upload_history',
  'rs_revenues',
  'rs_work_partners',
  'rs_works',
  'rs_partners',
];

for (const table of tables) {
  const res = await fetch(`${URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Prefer': 'return=representation',
    }
  });
  const data = await res.json();
  console.log(`${table}: deleted ${Array.isArray(data) ? data.length : 0} rows (${res.status})`);
}

console.log('\nDone! All rs_ tables cleared.');
