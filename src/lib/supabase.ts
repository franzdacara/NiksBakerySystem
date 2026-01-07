import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug logging
// console.log('Supabase URL:', supabaseUrl ? 'Found ✓' : 'Missing ✗');
// console.log('Supabase Anon Key:', supabaseAnonKey ? 'Found ✓' : 'Missing ✗');

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase credentials not found in .env file.');
    console.warn('Make sure your .env file has:');
    console.warn('  VITE_SUPABASE_URL=https://your-project.supabase.co');
    console.warn('  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...');
    console.warn('Then RESTART the dev server (Ctrl+C, npm run dev)');
}

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const isSupabaseConfigured = !!supabase;

// if (isSupabaseConfigured) {
//     console.log('✅ Supabase client initialized successfully!');
// }
