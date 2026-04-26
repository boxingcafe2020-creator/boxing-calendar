import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Vercel Cronからのリクエスト or 管理者からのリクエストを検証
  const cronSecret = request.headers.get('x-cron-secret')
  const isValidCron = cronSecret === process.env.CRON_SECRET

  if (!isValidCron) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { runAllScrapers } = await import('@/lib/scrapers')
    const results = await runAllScrapers()
    return NextResponse.json({ success: true, results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
