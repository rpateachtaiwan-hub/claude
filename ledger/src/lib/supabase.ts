import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabase = !!(URL && KEY)

// 未設定時用佔位 URL，避免 createClient 直接拋錯（示範模式不會真的連線）
export const supabase = createClient(
  URL || 'https://placeholder.supabase.co',
  KEY || 'placeholder',
)
