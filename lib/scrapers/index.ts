import { createClient } from '@supabase/supabase-js'
import { ScrapedEvent } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function runAllScrapers() {
  const results = { boxmob: 0, boxingscene: 0, ringmagazine: 0, errors: [] as string[] }

  // boxingscene runs first and upserts (overwrites existing records)
  try {
    const { scrapeBoxingScene } = await import('./boxingscene')
    const events = await scrapeBoxingScene()
    const count = await upsertEvents(events)
    results.boxingscene = count
    await logScrape('boxingscene', 'success', `${count}件追加/更新`, count)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`BoxingScene: ${msg}`)
    await logScrape('boxingscene', 'failed', msg, 0)
  }

  // ringmagazine runs after boxingscene; skips anything already in the DB
  try {
    const { scrapeRingMagazine } = await import('./ringmagazine')
    const { data: existing } = await supabase.from('events').select('title, event_date')
    const existingKeys = (existing || []).map(e => `${e.title}|${e.event_date}`)
    const events = await scrapeRingMagazine(existingKeys)
    const count = await saveEvents(events)
    results.ringmagazine = count
    await logScrape('ringmagazine', 'success', `${count}件追加`, count)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`RingMagazine: ${msg}`)
    await logScrape('ringmagazine', 'failed', msg, 0)
  }

  // boxmob: 一時スキップ（Rakuten OAuth対応待ち）
  await logScrape('boxmob', 'skipped', 'Rakuten OAuth未対応のためスキップ', 0)

  if (results.errors.length > 0) await sendErrorNotification(results.errors)
  return results
}

// Upsert: insert new events or overwrite existing ones matched by date+title
async function upsertEvents(events: ScrapedEvent[]): Promise<number> {
  if (events.length === 0) return 0
  let count = 0
  for (const event of events) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('event_date', event.event_date)
      .eq('title', event.title)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('events')
        .update({ ...event, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (!error) count++
    } else {
      const { error } = await supabase
        .from('events')
        .insert({ ...event, updated_at: new Date().toISOString() })
      if (!error) count++
    }
  }
  return count
}

// Insert only: skip events that already exist by date+title
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
      const { error } = await supabase
        .from('events')
        .insert({ ...event, updated_at: new Date().toISOString() })
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
