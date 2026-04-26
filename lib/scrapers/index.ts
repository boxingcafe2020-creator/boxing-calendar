import { createClient } from '@supabase/supabase-js'
import { ScrapedEvent } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function runAllScrapers() {
  const results = { boxmob: 0, boxingscene: 0, ringmagazine: 0, errors: [] as string[] }

  // boxingscene
  try {
    const { scrapeBoxingScene } = await import('./boxingscene')
    const events = await scrapeBoxingScene()
    const added = await saveEvents(events)
    results.boxingscene = added
    await logScrape('boxingscene', 'success', `${added}件追加`, added)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`BoxingScene: ${msg}`)
    await logScrape('boxingscene', 'failed', msg, 0)
  }

  // ringmagazine (boxingsceneの後に実行して重複チェック)
  try {
    const { scrapeRingMagazine } = await import('./ringmagazine')
    const { data: existing } = await supabase
      .from('events')
      .select('title, event_date')
      .eq('source', 'boxingscene')
    const existingKeys = (existing || []).map(e => `${e.title}|${e.event_date}`)
    const events = await scrapeRingMagazine(existingKeys)
    const added = await saveEvents(events)
    results.ringmagazine = added
    await logScrape('ringmagazine', 'success', `${added}件追加`, added)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`RingMagazine: ${msg}`)
    await logScrape('ringmagazine', 'failed', msg, 0)
  }

  // boxmob (ログイン必要)
  try {
    const { scrapeBoxmob } = await import('./boxmob')
    const events = await scrapeBoxmob()
    const added = await saveEvents(events)
    results.boxmob = added
    await logScrape('boxmob', 'success', `${added}件追加`, added)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`Boxmob: ${msg}`)
    await logScrape('boxmob', 'failed', msg, 0)
  }

  // エラーがあればメール通知
  if (results.errors.length > 0) {
    await sendErrorNotification(results.errors)
  }

  return results
}

async function saveEvents(events: ScrapedEvent[]): Promise<number> {
  if (events.length === 0) return 0
  let added = 0
  for (const event of events) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('event_date', event.event_date)
      .eq('title', event.title)
      .single()
    if (!existing) {
      const { error } = await supabase.from('events').insert({
        ...event,
        updated_at: new Date().toISOString(),
      })
      if (!error) added++
    }
  }
  return added
}

async function logScrape(source: string, status: string, message: string, events_added: number) {
  await supabase.from('scrape_logs').insert({ source, status, message, events_added })
}

async function sendErrorNotification(errors: string[]) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ errors }),
    })
  } catch {}
}
