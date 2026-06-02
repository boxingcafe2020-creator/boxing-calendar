import * as cheerio from 'cheerio'
import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const JST = 'Asia/Tokyo'
const SCHEDULE_URL = 'https://www.boxingscene.com/schedule'
const BROADCAST_RE = /DAZN|ESPN|HBO|Showtime|Amazon Prime|Netflix|PPV|Prime Video|Fox|NBC|ABC|Peacock|Apple TV|Sky|TNT|ProBox|FITE/i

// Timezone abbreviation → UTC offset in hours (handles EST/EDT/BST etc.)
const TZ_OFFSETS: Record<string, number> = {
  EST: -5, EDT: -4, ET: -5,  // ET treated as EST; DST correction applied in localToJST
  CST: -6, CDT: -5,
  MST: -7, MDT: -6,
  PST: -8, PDT: -7,
  GMT: 0,  UTC: 0,
  BST: 1,
  WET: 0,  WEST: 1,
  CET: 1,  CEST: 2,
  EET: 2,  EEST: 3,
  JST: 9,
}

// BoxingScene labels all Eastern Time events "EST" regardless of DST.
// In summer (DST active) Eastern Time is EDT = UTC-4, not EST = UTC-5.
// US DST: second Sunday of March → first Sunday of November.
function isEasternDST(datePart: string): boolean {
  const year = parseInt(datePart.slice(0, 4))
  const dateMs = new Date(datePart + 'T12:00:00Z').getTime()
  const mar1Day = new Date(Date.UTC(year, 2, 1)).getUTCDay()
  const firstSunMar = mar1Day === 0 ? 1 : 8 - mar1Day
  const dstStart = new Date(Date.UTC(year, 2, firstSunMar + 7, 7, 0, 0)).getTime() // 2 AM EST = 07:00 UTC
  const nov1Day = new Date(Date.UTC(year, 10, 1)).getUTCDay()
  const firstSunNov = nov1Day === 0 ? 1 : 8 - nov1Day
  const dstEnd = new Date(Date.UTC(year, 10, firstSunNov, 6, 0, 0)).getTime() // 2 AM EDT = 06:00 UTC
  return dateMs >= dstStart && dateMs < dstEnd
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
  slug?: string
  event_date?: string
  event_time?: string
  event_timezone?: string
  networks?: Array<{ name?: string; date?: string; time?: string; timezone?: string }>
}

interface BSResponse {
  results: BSEventItem[]
  next_command?: { args?: Cursor } | null
}

// Convert a local date+time in a given tz abbreviation → JST date+time.
// "EST"/"ET" are treated as Eastern Time with proper DST handling.
function localToJST(datePart: string, hour: number, min: number, tzAbbr: string): { date: string; time: string } | null {
  const upper = tzAbbr.toUpperCase()
  let offset = TZ_OFFSETS[upper]
  if (offset === undefined) return null
  // Apply DST correction: BoxingScene writes "EST" year-round but means EDT in summer
  if ((upper === 'EST' || upper === 'ET') && isEasternDST(datePart)) offset = -4
  const fakeUtcMs = new Date(`${datePart}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`).getTime()
  const utcMs = fakeUtcMs - offset * 3_600_000
  const jst = toZonedTime(new Date(utcMs), JST)
  return {
    date: tzFormat(jst, 'yyyy-MM-dd', { timeZone: JST }),
    time: tzFormat(jst, 'HH:mm', { timeZone: JST }),
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents: é→e, ñ→n, etc.
    .replace(/[''`´‘’ʼ]/g, '')           // remove apostrophes incl. curly quotes
    .replace(/\s+vs\.\s+/i, '-vs-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const JAPAN_LOCATIONS = ['japan', 'tokyo', 'osaka', 'nagoya', 'yokohama', 'saitama', 'fukuoka', 'kobe', 'kyoto', 'hiroshima', 'sendai', '札幌', 'sapporo']

function isJapanLocation(location: string | null): boolean {
  if (!location) return false
  const l = location.toLowerCase()
  return JAPAN_LOCATIONS.some(k => l.includes(k)) || /[぀-ヿ一-鿿]/.test(location)
}

// Parse "Saturday | May 2, 2026 | 8:00 PM EST" → JST date + time.
// fallbackTz is used when the header has no timezone abbreviation.
// skipMidnightCorrection: true for Japan events (12:00 AM may be a valid local time).
function parseHeaderToJST(header: string, fallbackTz = 'EST', skipMidnightCorrection = false): { date: string; time: string } | null {
  const tm = header.match(/(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s+([A-Z]{2,4}))?/i)
  if (!tm) return null
  const [, h, min, ampm, tzAbbr] = tm
  const tz = tzAbbr || fallbackTz

  const dm = header.match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (!dm) return null
  const month = MONTH_MAP[dm[1].toLowerCase().slice(0, 3)]
  if (!month) return null
  const localDate = `${dm[3]}-${String(month).padStart(2, '0')}-${String(parseInt(dm[2])).padStart(2, '0')}`

  let hour = parseInt(h)
  if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12
  if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0

  // "12:00 AM" is BoxingScene's placeholder when the real time isn't set yet.
  // Treat as 18:00 (6 PM) local time — except for Japan events where midnight may be valid.
  if (hour === 0 && parseInt(min) === 0 && !skipMidnightCorrection) hour = 18

  return localToJST(localDate, hour, parseInt(min), tz)
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

// Detect Japan from an event detail page.
// The location section renders as: ">Location</div><div ...>CityName, Japan</div>"
function isJapanEventPage(html: string): boolean {
  return /Location<\/div>(?:<[^>]*>)*([^<]*(?:Japan|Tokyo|Osaka|Nagoya|Yokohama|Sapporo|Fukuoka|Kobe|Kyoto|Tokoname)[^<]*)/i.test(html)
}

// Fetch an individual event page and return the time header + Japan flag.
async function fetchEventPageInfo(slug: string): Promise<{ header: string | null; isJapan: boolean }> {
  try {
    const res = await fetch(`https://www.boxingscene.com/events/${slug}`, { cache: 'no-store', headers: { 'User-Agent': UA } })
    if (!res.ok) return { header: null, isJapan: false }
    const html = await res.text()
    // Match both old format "Saturday | May 2, 2026 | 8:00 PM EST"
    // and new format "Sat, Jun 6, 2026 - 12:00 AM EST"
    const m = html.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^|<\n]*(?:\|[^|<\n]+\||\s*[-–]\s*)[^<\n]*\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s+[A-Z]{2,4})?/i)
    return { header: m ? m[0].trim() : null, isJapan: isJapanEventPage(html) }
  } catch { return { header: null, isJapan: false } }
}

async function callServerAction(cursor: Cursor, actionId: string): Promise<BSResponse | null> {
  const res = await fetch(SCHEDULE_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'User-Agent': UA,
      'Next-Action': actionId,
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

// Dynamically extract the Next-Action ID from the schedule page JS chunk every run.
// BoxingScene redeploys Next.js periodically, rotating this hash — never hardcode it.
// Strategy:
//   1. Named pattern: look for the hash next to "PostgresQueryReadonlyServerFunc" (current name).
//   2. Probe: collect all createServerReference hashes and try each via the real API.
//   3. Throw if nothing works so errors are visible rather than silently stale.
async function resolveActionId(html: string, cursor: Cursor): Promise<string> {
  const chunkMatch = html.match(/\/_next\/static\/chunks\/app\/schedule\/page-([^.]+)\.js/)
  if (!chunkMatch) throw new Error('BoxingScene: schedule JS chunk URL not found in page HTML — site structure may have changed')

  const jsUrl = `https://www.boxingscene.com/_next/static/chunks/app/schedule/page-${chunkMatch[1]}.js`
  const jsRes = await fetch(jsUrl, { cache: 'no-store', headers: { 'User-Agent': UA } })
  if (!jsRes.ok) throw new Error(`BoxingScene: could not load schedule JS chunk (HTTP ${jsRes.status})`)
  const js = await jsRes.text()

  // Primary: target the known function name — fast and precise when it matches
  const namedMatch = js.match(/createServerReference\)\("([0-9a-f]{40,})"[^)]*"PostgresQueryReadonlyServerFunc"/)
  if (namedMatch) return namedMatch[1]

  // Secondary: function was renamed — probe every candidate hash against the real API
  const candidates = [...js.matchAll(/createServerReference\)\("([0-9a-f]{40,})"/g)].map(m => m[1])
  for (const id of candidates) {
    const data = await callServerAction(cursor, id).catch(() => null)
    if (data?.results) return id
  }

  throw new Error('BoxingScene: no valid Next-Action ID found in schedule JS — site API may have changed')
}

export async function scrapeBoxingScene(): Promise<ScrapedEvent[]> {
  const res = await fetch(SCHEDULE_URL, { cache: 'no-store', headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`BoxingScene fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  // Build slug → {broadcast, timeHeader, href}
  // Each event card has two anchors with the same href (image + text).
  // The time header is INSIDE the text anchor: "Sat, Jun 6, 2026 - 12:00 AM EST"
  const anchorInfo: Record<string, { broadcast: string | null; timeHeader: string | null; href: string }> = {}
  $('a[href*="/events/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const slug = href.replace('/events/', '').replace(/\/$/, '')
    if (!slug) return

    const innerText = $(el).text()
    const broadcastMatch = innerText.match(BROADCAST_RE)
    const broadcast = broadcastMatch ? broadcastMatch[0] : null
    // Time may be in a div or span inside the text anchor: "Sat, Jun 6, 2026 - 12:00 AM EST"
    // Search div+span children for one that starts with a day abbreviation
    let timeHeader: string | null = null
    $(el).find('div, span').each((_, node) => {
      if (timeHeader) return
      const text = $(node).text().trim()
      if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(text)) timeHeader = text
    })

    // Prefer entries that have time info; also pick up broadcast info from either anchor
    const prev = anchorInfo[slug]
    anchorInfo[slug] = {
      broadcast: broadcast ?? prev?.broadcast ?? null,
      timeHeader: timeHeader ?? prev?.timeHeader ?? null,
      href,
    }
  })

  // For events showing "12:00 AM" (unconfirmed time placeholder), pre-fetch detail pages
  // to check if the event is in Japan — Japan events must not have the midnight→18:00 correction applied.
  const midnightSlugs = Object.entries(anchorInfo)
    .filter(([, info]) => /12:00 AM/i.test(info.timeHeader || ''))
    .map(([slug]) => slug)
  const japanSlugs = new Set<string>()
  await Promise.all(midnightSlugs.map(async (slug) => {
    try {
      const res = await fetch(`https://www.boxingscene.com/events/${slug}`, { cache: 'no-store', headers: { 'User-Agent': UA } })
      if (res.ok && isJapanEventPage(await res.text())) japanSlugs.add(slug)
    } catch {}
  }))

  // Today in JST for filtering past events
  const nowJst = toZonedTime(new Date(), JST)
  const todayJst = tzFormat(nowJst, 'yyyy-MM-dd', { timeZone: JST })

  const seen = new Map<string, number>()  // key → index in merged
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

        const location: string | null =
          item.location?.name || item.location?.address?.addressRegion || null

        // Convert to JST using time header when available
        const isJapan = isJapanLocation(location) || japanSlugs.has(slug)
        const jst = info?.timeHeader ? parseHeaderToJST(info.timeHeader, 'EST', isJapan) : null
        const eventDate = jst?.date || (item.startDate as string || '')
        const eventTime = jst?.time || null

        if (!eventDate || eventDate < todayJst) continue

        const k = addKey(eventDate, name)
        if (seen.has(k)) continue
        seen.set(k, merged.length)

        merged.push({
          title: name,
          event_date: eventDate,
          event_time: eventTime,
          location,
          broadcast_info: info?.broadcast ?? null,
          match_details: null,
          source: 'boxingscene',
          source_url: info?.href
            ? `https://www.boxingscene.com${info.href}`
            : `https://www.boxingscene.com/events/${slugify(name)}`,
        })
      }
    } catch {}
  })

  // Paginate via server action to collect all remaining events
  const initialCursor = parseCursorFromHtml(html)
  if (initialCursor) {
    const actionId = await resolveActionId(html, initialCursor)
    let cursor: Cursor | null = initialCursor
    const seenCursors = new Set<string>()

    while (cursor) {
      const key = `${cursor.last_event_id}|${cursor.last_event_date}`
      if (seenCursors.has(key)) break
      seenCursors.add(key)

      const response = await callServerAction(cursor, actionId)
      if (!response) break

      const pageEvents = (response.results ?? []).filter(e => e.entity_type_id === 2)
      if (pageEvents.length === 0) break

      for (const ev of pageEvents) {
        const title = ev.tag_name?.trim() || ''
        const estDate = ev.event_date || ''
        if (!title || !estDate) continue

        // Convert local date+time → JST: prefer top-level event_time, fall back to networks[].time
        const net = ev.networks?.find(n => n.time && n.timezone)
        let eventDate = estDate
        let eventTime: string | null = null
        if (ev.event_time) {
          let [h, m] = ev.event_time.split(':').map(Number)
          const tz = ev.event_timezone || 'EST'
          const evIsJapan = tz.toUpperCase() === 'JST' || japanSlugs.has(ev.slug || '')
          if (h === 0 && m === 0 && !evIsJapan) h = 18
          const jst = localToJST(estDate, h, m, tz)
          if (jst) { eventDate = jst.date; eventTime = jst.time }
        } else if (net?.time && net.timezone) {
          let [h, m] = net.time.split(':').map(Number)
          const evIsJapan = net.timezone.toUpperCase() === 'JST' || japanSlugs.has(ev.slug || '')
          if (h === 0 && m === 0 && !evIsJapan) h = 18
          const jst = localToJST(estDate, h, m, net.timezone)
          if (jst) { eventDate = jst.date; eventTime = jst.time }
        } else if (ev.slug) {
          const pageInfo = await fetchEventPageInfo(ev.slug)
          if (pageInfo.isJapan) japanSlugs.add(ev.slug)
          if (pageInfo.header) {
            const evIsJapan = pageInfo.isJapan || ev.event_timezone === 'JST'
            const jst = parseHeaderToJST(pageInfo.header, ev.event_timezone || 'EST', evIsJapan)
            if (jst) { eventDate = jst.date; eventTime = jst.time }
          }
        }

        if (eventDate < todayJst) continue

        const k = addKey(eventDate, title)

        // Collect all unique broadcast platform names
        const networkNames = [...new Set((ev.networks ?? []).map(n => n.name).filter(Boolean) as string[])]
        const broadcastInfo = networkNames.length ? networkNames.join(' / ') : null
        const sourceUrl = ev.slug
          ? `https://www.boxingscene.com/events/${ev.slug}`
          : `https://www.boxingscene.com/events/${slugify(title)}`

        const existingIdx = seen.get(k)
        if (existingIdx !== undefined) {
          // Patch existing JSON-LD entry if server action has better info
          const e = merged[existingIdx]
          if (!e.broadcast_info && broadcastInfo) e.broadcast_info = broadcastInfo
          if (ev.slug && !e.source_url?.endsWith(`/${ev.slug}`)) e.source_url = sourceUrl
          continue
        }
        seen.set(k, merged.length)

        merged.push({
          title,
          event_date: eventDate,
          event_time: eventTime,
          location: null,
          broadcast_info: broadcastInfo,
          match_details: null,
          source: 'boxingscene',
          source_url: sourceUrl,
        })
      }

      const nextArgs = response.next_command?.args
      cursor = nextArgs?.last_event_id ? nextArgs : null
    }
  }

  return merged
}
