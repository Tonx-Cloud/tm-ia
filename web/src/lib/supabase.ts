import { createClient } from '@supabase/supabase-js'

// Get Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce', // More secure for OAuth
    },
})

// Auth helper functions
export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    })

    if (error) throw error
    return data
}

export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
}

export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    return session
}

export async function getUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
}

// Subscribe to auth state changes
export function onAuthStateChange(callback: (session: unknown) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
        callback(session)
    })
}
