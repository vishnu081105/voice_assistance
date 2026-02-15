import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function parseDotEnv(content){
  const out={};
  content.split(/\r?\n/).forEach(line=>{
    const m=line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
    if(!m) return;
    out[m[1]] = (m[2]??m[3]??m[4]??'').trim();
  });
  return out;
}

const envRaw = fs.readFileSync(new URL('../.env', import.meta.url));
const env = parseDotEnv(envRaw.toString());
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!SUPABASE_URL || !SUPABASE_KEY){
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run(){
  const ts = Date.now();
  const email = `test+${ts}@example.com`;
  const password = `Test@${ts}`;
  console.log('Signing up user', email);

  const { data, error } = await supabase.auth.signUp({ email, password });
  if(error){
    console.error('SignUp error:', error);
    process.exit(1);
  }
  console.log('SignUp result:', data);

  // Get session / user id
  const sessRes = await supabase.auth.getSession();
  const user = data.user ?? sessRes.data.session?.user;
  if(!user){
    console.error('No user returned after signUp. Email confirmation may be required.');
    console.error('Session info:', sessRes);
    process.exit(1);
  }
  const userId = user.id;
  console.log('Authenticated as user id:', userId);

  // Insert a profile row into users table (as the signed-in user)
  console.log('Inserting profile row into public.users');
  const { data: upsertUser, error: upsertErr } = await supabase.from('users').upsert({ id: userId, email, full_name: 'Test User' }, { onConflict: 'id' });
  if(upsertErr){
    console.error('Failed to upsert user row:', upsertErr);
  } else {
    console.log('Upserted user row:', upsertUser);
  }

  // Insert a test report
  console.log('Inserting a sample report');
  const { data: reportData, error: reportErr } = await supabase.from('reports').insert([{ user_id: userId, transcription: 'test transcription', report_content: 'test report', report_type: 'general' }]).select();
  if(reportErr){
    console.error('Failed to insert report:', reportErr);
  } else {
    console.log('Inserted report:', reportData);
  }

  // Query back user row and reports
  const { data: users, error: usersErr } = await supabase.from('users').select('*').eq('id', userId);
  const { data: reports, error: reportsErr } = await supabase.from('reports').select('*').eq('user_id', userId);
  console.log('Users query error:', usersErr);
  console.log('Reports query error:', reportsErr);
  console.log('Users:', users);
  console.log('Reports:', reports);
}

run().then(()=>console.log('Done')).catch(e=>{console.error(e); process.exit(1)});
