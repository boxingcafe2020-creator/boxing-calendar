import * as cheerio from 'cheerio'
import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const JST = 'Asia/Tokyo'
const ACTION_ID = '7f4b36036e955f48bf1ea1c93d1030f6ad6540be72'
const SCHEDULE_URL = 'https://www.boxingscene.com/schedule'
const BROADCAST_RE = /DAZN|ESPN|HBO|Showtime|Amazon Prime|Netflix|PPV|Prime Video|Fox|NBC|ABC|Peacock|Apple TV|Sky|TNT|ProBox|FITE/i

// Timezone abbreviation → UTC offset in hours (handles EST/EDT/BST etc.)
const TZ_OFFSETS: Record<string, number> = {
  EST: -5, EDT: -4,
  CST: -6, CDT: -5,
  MST: -7, MDT: -6,
  PST: -8, PDT: -7,
  GMT: 0,  BST: 1,
  WET: 0,  WEST: 1,
  CET: 1,  CEST: 2,
  JST: 9,
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

interface Cursor {
  last_event_id: number
  last_event_date: string
}

interface BSEventItem {
  entity_type_id: number
  tag_name?: string
  event_date?: string
  event_timezone?: string
  networks?: Array<{ name?: string; date?: string }>
}

interface BSResponse {
  results: BSEventItem[]
  next_command?: { args?: Cursor } | null
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+vs\.\s+/i, '-vs-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Parse BoxingScene time header "Saturday | May 2, 2026 | 8:00 PM EST" → JST date + time.
 * BoxingScene lists all times in EST/EDT (America/New_York) but also shows UK/JP events.
 */
function parseHeaderToJST(header: string): { date: string; time: string } | null {
  // Extract time+tz: "8:00 PM EST"
  const tm = header.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,4})/i)
  if (!tm) return null
  const [, h, min, ampm, tzAbbr] = tm
  const offset = TZ_OFFSETS[tzAbbr.toUpperCase()]
  if (offset === undefined) return null

  // Extract date: "May 2, 2026"
  const dm = header.match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (!dm) return null
  const month = MONTH_MAP[dm[1].toLowerCase().slice(0, 3)]
  if (!month) return null
  const day = parseInt(dm[2])
  const year = parseInt(dm[3])
  const localDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // Build local datetime, treat as UTC, then shift by offset to get real UTC
  let hour = parseInt(h)
  if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12
  if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0

  const fakeUtcMs = new Date(`${localDate}T${String(hour).padStart(2, '0')}:${min}:00Z`).getTime()
  const utcMs = fakeUtcMs - offset * 3_600_000
  const jst = toZonedTime(new Date(utcMs), JST)

  return {
    date: tzFormat(jst, 'yyyy-MM-dd', { timeZone: JST }),
    time: tzFormat(jst, 'HH:mm', { timeZone: JST }),
  }
}

function parseCursorFromHtml(html: string): Cursor | null {
  const idMatch = html.match(/\\"last_event_id\\":(\d+)/)
  const dateMatch = html.match(/\\"last_event_date\\":\\"([^\\]+)\\"/)
  if (!idMatch || !dateMatch) return null
  return { last_event_id: parseInt(idMatch[1]), last_event_date: dateMatch[1] }
}

function parseRscResponse(text: string): BSResponse | null {
  const marker = '{"config":'
  const start = text.lastIndexOf(marker)
  if (start === -1) return null
  let depth = 0, end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (end === -1) return null
  try { return JSON.parse(text.slice(start, end)) as BSResponse } catch { return null }
}

async function callServerAction(cursor: Cursor): Promise<BSResponse | null> {
  const res = await fetch(SCHEDULE_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'User-Agent': UA,
      'Next-Action': ACTION_ID,
      'Content-Type': 'text/plain;charset=UTF-8',
      'Accept': 'text/x-component',
      'Origin': 'https://www.boxingscene.com',
      'Referer': SCHEDULE_URL,
    },
    body: JSON.stringify(['get_upcoming_events', cursor]),
  })
  if (!res.ok) throw new Error(`BoxingScene server action failed: ${res.status}`)
  return parseRscResponse(await res.text())
}

export async function scrapeBoxingScene(): Promise<ScrapedEvent[]> {
  const res = await fetch(SCHEDULE_URL, { cache: 'no-store', headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`BoxingScene fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  // Build slug → {broadcast, timeHeader, href}
  // NOTE: time header is the PREVIOUS SIBLING of the anchor (not parent().prev())
  // Header format: "Saturday | May 2, 2026 | 8:00 PM EST"
  const anchorInfo: Record<string, { broadcast: string | null; timeHeader: string | null; href: string }> = {}
  $('a[href*="/events/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text()
    const broadcastMatch = text.match(BROADCAST_RE)
    const broadcast = broadcastMatch ? broadcastMatch[0] : null
    const timeHeader = $(el).prev().text().trim() || null  // "Saturday | May 2, 2026 | 8:00 PM EST"
    const slug = href.replace('/events/', '').replace(/\/$/, '')
    anchorInfo[slug] = { broadcast, timeHeader, href }
  })

  // Today in JST for filtering past events
  const nowJst = toZonedTime(new Date(), JST)
  const todayJst = tzFormat(nowJst, 'yyyy-MM-dd', { timeZone: JST })

  const seen = new Set<string>()
  const merged: ScrapedEvent[] = []

  const addKey = (date: string, title: string) =>
    `${date}|${title.toLowerCase().replace(/\s+/g, ' ').trim()}`

  // Parse JSON-LD for the initial ~10 events (with full JST conversion when time is available)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      const list = data?.mainEntity?.itemListElement
      if (!Array.isArray(list)) return
      for (const item of list) {
        if (item['@type'] !== 'SportsEvent') continue
        const name: string = item.name || ''
        if (!name) continue

        const slug = slugify(name)
        const info = anchorInfo[slug] || null

        // Convert to JST using time header when available
        const jst = info?.timeHeader ? parseHeaderToJST(info.timeHeader) : null
        const eventDate = jst?.date || (item.startDate as string || '')
        const eventTime = jst?.time || null

        if (!eventDate || eventDate < todayJst) continue

        const k = addKey(eventDate, name)
        if (seen.has(k)) continue
        seen.add(k)

        const location: string | null =
          item.location?.name || item.location?.address?.addressRegion || null

        merged.push({
          title: name,
          event_date: eventDate,
          event_time: eventTime,
          location,
          broadcast_info: info?.broadcast ?? null,
          match_details: null,
          source: 'boxingscene',
          source_url: info?.href ? `https://www.boxingscene.com${info.href}` : SCHEDULE_URL,
        })
      }
    } catch {}
  })

  // Paginate via server action to collect all remaining events
  const initialCursor = parseCursorFromHtml(html)
  if (initialCursor) {
    let cursor: Cursor | null = initialCursor
    const seenCursors = new Set<string>()

    while (cursor) {
      const key = `${cursor.last_event_id}|${cursor.last_event_date}`
      if (seenCursors.has(key)) break
      seenCursors.add(key)

      const response = await callServerAction(cursor)
      if (!response) break

      const pageEvents = (response.results ?? []).filter(e => e.entity_type_id === 2)
      if (pageEvents.length === 0) break

      for (const ev of pageEvents) {
        const title = ev.tag_name?.trim() || ''
        // event_date from server action is the local (EST) date
        // Without time info for these events, keep as-is
        const date = ev.event_date || ''
        if (!title || !date || date < todayJst) continue

        const k = addKey(date, title)
        if (seen.has(k)) continue
        seen.add(k)

        const slug = slugify(title)
        const info = anchorInfo[slug] || null
        // Server action events may also have anchor info if slug matches
        const jst = info?.timeHeader ? parseHeaderToJST(info.timeHeader) : null
        const eventDate = jst?.date || date
        const eventTime = jst?.time || null

        merged.push({
          title,
          event_date: eventDate,
          event_time: eventTime,
          location: null,
          broadcast_info: info?.broadcast ?? (ev.networks?.[0]?.name || null),
          match_details: null,
          source: 'boxingscene',
          source_url: SCHEDULE_URL,
        })
      }

      const nextArgs = response.next_command?.args
      cursor = nextArgs?.last_event_id ? nextArgs : null
    }
  }

  return merged
}
