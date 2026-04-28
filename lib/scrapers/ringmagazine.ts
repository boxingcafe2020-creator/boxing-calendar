import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const JST = 'Asia/Tokyo'
const API_BASE = 'https://www.ringmagazine.com/api/events'

interface RingEvent {
  id: string
  slogan: string
  start: string
  venue?: {
    venueName?: string
    city?: string
    country?: string
  } | null
  mainFight?: {
    slogan?: string
    startTime?: string
  } | null
}

interface ApiResponse {
  data: RingEvent[]
  pages: number
  last: number
}

function utcToJST(isoUtc: string): { date: string; time: string } | null {
  try {
    const d = new Date(isoUtc)
    if (isNaN(d.getTime())) return null
    const jst = toZonedTime(d, JST)
    return {
      date: tzFormat(jst, 'yyyy-MM-dd', { timeZone: JST }),
      time: tzFormat(jst, 'HH:mm', { timeZone: JST }),
    }
  } catch {
    return null
  }
}

async function fetchPage(page: number): Promise<ApiResponse> {
  const res = await fetch(`${API_BASE}?page=${page}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`RingMagazine API page ${page} failed: ${res.status}`)
  return res.json()
}

export async function scrapeRingMagazine(existingTitles: string[]): Promise<ScrapedEvent[]> {
  // Page 1 gives us total page count; upcoming events cluster on the last pages
  const first = await fetchPage(1)
  const totalPages = first.last || first.pages || 1

  // Collect from last 4 pages (where recently-added upcoming events live)
  const pageNums = Array.from(
    { length: Math.min(4, totalPages) },
    (_, i) => totalPages - i
  ).filter(p => p > 0)

  // page 1 already fetched – reuse it if it falls in the range
  const allEvents: RingEvent[] = pageNums.includes(1) ? first.data : []

  await Promise.all(
    pageNums.filter(p => p !== 1).map(async (p) => {
      const page = await fetchPage(p)
      allEvents.push(...page.data)
    })
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const events: ScrapedEvent[] = []

  for (const ev of allEvents) {
    const startIso = ev.mainFight?.startTime || ev.start
    if (!startIso) continue

    const jst = utcToJST(startIso)
    if (!jst) continue

    // Only upcoming events
    if (new Date(jst.date) < today) continue

    const title = ev.mainFight?.slogan || ev.slogan || ''
    if (!title) continue

    if (isDuplicate(title, jst.date, existingTitles)) continue

    const venue = ev.venue
    const location = [venue?.venueName, venue?.city]
      .filter(Boolean)
      .join(', ') || null

    events.push({
      title,
      event_date: jst.date,
      event_time: jst.time,
      location,
      broadcast_info: null,
      match_details: null,
      source: 'ringmagazine',
      source_url: 'https://www.ringmagazine.com/events/',
    })
  }

  // Deduplicate within this batch (same event can appear on multiple pages)
  const seen = new Set<string>()
  return events.filter(e => {
    const key = `${e.event_date}|${e.title.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isDuplicate(title: string, date: string, existingTitles: string[]): boolean {
  const normalize = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9]/g, '').split('vs').sort().join('vs')
  const normalized = normalize(title)
  return existingTitles.some(existing => {
    const [existTitle] = existing.split('|')
    return normalize(existTitle) === normalized
  })
}
