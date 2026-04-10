import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Secondary client — connects to RRHH/Hub Supabase (fichadas, organigrama, etc.)
const hubUrl = import.meta.env.VITE_HUB_SUPABASE_URL
const hubKey = import.meta.env.VITE_HUB_SUPABASE_ANON_KEY
export const supabaseHub = (hubUrl && hubKey) ? createClient(hubUrl, hubKey) : null
