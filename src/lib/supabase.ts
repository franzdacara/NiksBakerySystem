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

// Row Level Security is ON for every table. Because the app uses its own login
// instead of Supabase Auth, every request carries the app session token in this
// header, and the database policies (section 4 of supabase_full_setup.sql) only
// let a request through when the token belongs to a live session. Without it,
// someone holding just the public anon key gets nothing.
export const SESSION_HEADER = 'x-session-token';
let sessionToken: string | null = null;

/** Called by the store on login / session resume (token) and logout (null). */
export const setSessionToken = (token: string | null) => { sessionToken = token; };

const fetchWithSession: typeof fetch = (input, init) => {
    if (!sessionToken) return fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set(SESSION_HEADER, sessionToken);
    return fetch(input, { ...init, headers });
};

// This app has its own login (the login_user() database function) and never uses
// Supabase Auth sessions. Turning the auth machinery off stops supabase-js from
// grabbing a browser lock ("Navigator LockManager lock ... immediately failed"),
// which clashes with hot reload, React dev double-mounting and multiple tabs.
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: { fetch: fetchWithSession },
    })
    : null;

export const isSupabaseConfigured = !!supabase;

// if (isSupabaseConfigured) {
//     console.log('✅ Supabase client initialized successfully!');
// }
