import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

// Vercel cron sends GET with Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  return runScrape()
}

// Admin UI triggers via POST (Supabase session auth)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  return runScrape()
}

async function runScrape(): Promise<NextResponse> {
  try {
    const { runAllScrapers } = await import('@/lib/scrapers')
    const results = await runAllScrapers()
    return NextResponse.json({ success: true, results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
