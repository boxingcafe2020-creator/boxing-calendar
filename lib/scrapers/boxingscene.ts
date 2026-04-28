import * as cheerio from 'cheerio'
import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const JST = 'Asia/Tokyo'
const BROADCAST_RE = /DAZN|ESPN|HBO|Showtime|Amazon Prime|Netflix|PPV|Prime Video|Fox|NBC|ABC|Peacock|Apple TV|Sky|TNT|ProBox|FITE/i

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+vs\.\s+/i, '-vs-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// "5:00 AM EST" → JST time string, or null
function headerTimeToJST(headerText: string): string | null {
  const tzMap: Record<string, string> = {
    EST: 'America/New_York', EDT: 'America/New_York',
    CST: 'America/Chicago',  CDT: 'America/Chicago',
    PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  }
  const m = headerText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,4})/)
  if (!m) return null
  const [, h, min, ampm, tzAbbr] = m
  const tz = tzMap[tzAbbr]
  if (!tz) return null
  // Build a parseable string using a fixed date
  const parsed = new Date(`2000-01-01 ${h}:${min} ${ampm}`)
  if (isNaN(parsed.getTime())) return null
  // Approximate offset: create a Date with the right UTC time
  const offsets: Record<string, number> = {
    'America/New_York': -5, 'America/Chicago': -6,
    'America/Denver': -7, 'America/Los_Angeles': -8,
  }
  const offset = offsets[tz] ?? -5
  const utcMs = parsed.getTime() - offset * 3600000
  const jst = toZonedTime(new Date(utcMs), JST)
  return tzFormat(jst, 'HH:mm', { timeZone: JST })
}

export async function scrapeBoxingScene(): Promise<ScrapedEvent[]> {
  const res = await fetch('https://www.boxingscene.com/schedule', {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`BoxingScene fetch failed: ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)

  // --- Parse Schema.org JSON-LD (primary data source) ---
  let schemaItems: any[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      const list = data?.mainEntity?.itemListElement
      if (Array.isArray(list) && list.length > 0) {
        schemaItems = list
      }
    } catch {}
  })

  if (schemaItems.length === 0) throw new Error('BoxingScene: JSON-LD event list not found')

  // --- Build slug → {broadcast, time, href} map from HTML anchors ---
  const anchorInfo: Record<string, { broadcast: string | null; time: string | null; href: string }> = {}
  $('a[href*="/events/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text()

    const broadcastMatch = text.match(BROADCAST_RE)
    const broadcast = broadcastMatch ? broadcastMatch[0] : null

    // Date/time header is in the preceding sibling of the anchor's parent
    const headerText = $(el).parent().prev().text()
    const time = headerTimeToJST(headerText)

    const slug = href.replace('/events/', '').replace(/\/$/, '')
    anchorInfo[slug] = { broadcast, time, href }
  })

  const events: ScrapedEvent[] = []

  for (const item of schemaItems) {
    if (item['@type'] !== 'SportsEvent') continue
    const date = item.startDate as string | undefined
    if (!date) continue

    const name: string = item.name || ''
    const location: string | null =
      item.location?.name || item.location?.address?.addressRegion || null

    const slug = slugify(name)
    const info = anchorInfo[slug] || null

    events.push({
      title: name,
      event_date: date,
      event_time: info?.time ?? null,
      location,
      broadcast_info: info?.broadcast ?? null,
      match_details: null,
      source: 'boxingscene',
      source_url: info?.href
        ? `https://www.boxingscene.com${info.href}`
        : 'https://www.boxingscene.com/schedule',
    })
  }

  return events
}
