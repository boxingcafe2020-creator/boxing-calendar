import { createClient } from '@supabase/supabase-js'
import { ScrapedEvent } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function runAllScrapers() {
  const results = { boxingscene: 0, boxmob: 0, errors: [] as string[] }

  // Remove any legacy ringmagazine events left in the DB
  await supabase.from('events').delete().eq('source', 'ringmagazine')

  // BoxingScene first — Boxmob runs after and overwrites duplicates (Boxmob takes priority)
  try {
    const { scrapeBoxingScene } = await import('./boxingscene')
    const events = await scrapeBoxingScene()
    const count = await upsertEvents(events)
    results.boxingscene = count
    await logScrape('boxingscene', 'success', `スクレイプ${events.length}件 / DB${count}件追加/更新`, count)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`BoxingScene: ${msg}`)
    await logScrape('boxingscene', 'failed', msg, 0)
  }

  try {
    const { scrapeBoxmob } = await import('./boxmob')
    const events = await scrapeBoxmob()
    const count = await upsertEvents(events)
    results.boxmob = count
    await logScrape('boxmob', 'success', `スクレイプ${events.length}件 / DB${count}件追加/更新`, count)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.errors.push(`Boxmob: ${msg}`)
    await logScrape('boxmob', 'failed', msg, 0)
  }

  if (results.errors.length > 0) await sendErrorNotification(results.errors)
  return results
}

async function upsertEvents(events: ScrapedEvent[]): Promise<number> {
  if (events.length === 0) return 0

  const { toZonedTime, format: tzFormat } = await import('date-fns-tz')
  const todayJst = tzFormat(toZonedTime(new Date(), 'Asia/Tokyo'), 'yyyy-MM-dd', { timeZone: 'Asia/Tokyo' })

  let count = 0
  for (const event of events) {
    if (event.event_date < todayJst) continue

    // limit(1)+order instead of .single() — .single() errors on 0 or 2+ rows,
    // which would silently skip the update and keep inserting duplicates.
    const { data: rows } = await supabase
      .from('events')
      .select('id, event_time, location, broadcast_info, match_details')
      .eq('source', event.source)
      .eq('title', event.title)
      .order('created_at', { ascending: false })
      .limit(1)

    const existing = rows?.[0] ?? null

    if (existing) {
      // Smart merge: non-null scraped values win; keep existing when scraper has nothing.
      // This way newly-added info (broadcast, time, venue) always propagates,
      // while manually-set or previously-scraped data isn't erased if scraper returns null.
      const patch = {
        event_date: event.event_date,
        event_time: event.event_time ?? existing.event_time,
        location: event.location ?? existing.location,
        broadcast_info: event.broadcast_info ?? existing.broadcast_info,
        match_details: event.match_details ?? existing.match_details,
        source_url: event.source_url,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('events').update(patch).eq('id', existing.id)
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
