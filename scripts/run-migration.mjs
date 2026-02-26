import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_REF = 'fnwdvfapcgtqfcqowdaf';

// Find Supabase access token
const locations = [
  join(homedir(), '.supabase', 'access-token'),
  join(process.env.APPDATA || '', 'Supabase', 'access-token'),
  join(process.env.LOCALAPPDATA || '', 'supabase', 'access-token'),
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'supabase', 'access-token'),
];

let token = null;
for (const loc of locations) {
  try {
    token = readFileSync(loc, 'utf8').trim();
    console.log('Found token at:', loc);
    break;
  } catch {
    // try next
  }
}

if (!token) {
  console.log('Checked:', locations.join(', '));
  console.error('Supabase access token not found. Trying direct DB connection via service role...');

  // Fallback: use the pg module via pooler connection string
  // Supabase pooler: postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
  console.log('\nPlease run this SQL in Supabase Dashboard > SQL Editor:');
  const sql = readFileSync('migrations/add_contract_fields.sql', 'utf8');
  console.log(sql);
  process.exit(1);
}

// Use Management API to run SQL
const sql = readFileSync('migrations/add_contract_fields.sql', 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

if (res.ok) {
  const data = await res.json();
  console.log('Migration executed successfully!');
  console.log(JSON.stringify(data, null, 2));
} else {
  const text = await res.text();
  console.error('Failed:', res.status, text);
}
