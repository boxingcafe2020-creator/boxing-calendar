import * as cheerio from 'cheerio'
import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const JST = 'Asia/Tokyo'
const ACTION_ID = '7f4b36036e955f48bf1ea1c93d1030f6ad6540be72'
const SCHEDULE_URL = 'https://www.boxingscene.com/schedule'
const BROADCAST_RE = /DAZN|ESPN|HBO|Showtime|Amazon Prime|Netflix|PPV|Prime Video|Fox|NBC|ABC|Peacock|Apple TV|Sky|TNT|ProBox|FITE/i

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

function headerTimeToJST(headerText: string): string | null {
  const tzMap: Record<string, string> = {
    EST: 'America/New_York', EDT: 'America/New_York',
    CST: 'America/Chicago', CDT: 'America/Chicago',
    PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  }
  const m = headerText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,4})/)
  if (!m) return null
  const [, h, min, ampm, tzAbbr] = m
  const tz = tzMap[tzAbbr]
  if (!tz) return null
  const parsed = new Date(`2000-01-01 ${h}:${min} ${ampm}`)
  if (isNaN(parsed.getTime())) return null
  const offsets: Record<string, number> = {
    'America/New_York': -5, 'America/Chicago': -6,
    'America/Denver': -7, 'America/Los_Angeles': -8,
  }
  const offset = offsets[tz] ?? -5
  const utcMs = parsed.getTime() - offset * 3600000
  const jst = toZonedTime(new Date(utcMs), JST)
  return tzFormat(jst, 'HH:mm', { timeZone: JST })
}

// Cursor is JSON-escaped inside a JS string in the HTML: \"last_event_id\":6279
function parseCursorFromHtml(html: string): Cursor | null {
  const idMatch = html.match(/\\"last_event_id\\":(\d+)/)
  const dateMatch = html.match(/\\"last_event_date\\":\\"([^\\]+)\\"/)
  if (!idMatch || !dateMatch) return null
  return { last_event_id: parseInt(idMatch[1]), last_event_date: dateMatch[1] }
}

// Find the BSResponse object in the RSC stream by locating {"config": and
// using bracket-counting to extract the complete JSON object.
function parseRscResponse(text: string): BSResponse | null {
  const marker = '{"config":'
  const start = text.lastIndexOf(marker)
  if (start === -1) return null
  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  if (end === -1) return null
  try {
    return JSON.parse(text.slice(start, end)) as BSResponse
  } catch {
    return null
  }
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

  // Build slug → {broadcast, JST time, href} from HTML anchors
  const anchorInfo: Record<string, { broadcast: string | null; time: string | null; href: string }> = {}
  $('a[href*="/events/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text()
    const broadcastMatch = text.match(BROADCAST_RE)
    const broadcast = broadcastMatch ? broadcastMatch[0] : null
    const headerText = $(el).parent().prev().text()
    const time = headerTimeToJST(headerText)
    const slug = href.replace('/events/', '').replace(/\/$/, '')
    anchorInfo[slug] = { broadcast, time, href }
  })

  // Parse JSON-LD for the initial batch (~10 events shown on page load)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const seen = new Set<string>()
  const merged: ScrapedEvent[] = []

  const addKey = (date: string, title: string) =>
    `${date}|${title.toLowerCase().replace(/\s+/g, ' ').trim()}`

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      const list = data?.mainEntity?.itemListElement
      if (!Array.isArray(list)) return
      for (const item of list) {
        if (item['@type'] !== 'SportsEvent') continue
        const date: string = item.startDate || ''
        const name: string = item.name || ''
        if (!date || !name || new Date(date) < today) continue
        const k = addKey(date, name)
        if (seen.has(k)) continue
        seen.add(k)
        const location: string | null =
          item.location?.name || item.location?.address?.addressRegion || null
        const slug = slugify(name)
        const info = anchorInfo[slug] || null
        merged.push({
          title: name,
          event_date: date,
          event_time: info?.time ?? null,
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
        const date = ev.event_date || ''
        if (!title || !date || new Date(date) < today) continue
        const k = addKey(date, title)
        if (seen.has(k)) continue
        seen.add(k)
        const slug = slugify(title)
        const info = anchorInfo[slug] || null
        merged.push({
          title,
          event_date: date,
          event_time: info?.time ?? null,
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
