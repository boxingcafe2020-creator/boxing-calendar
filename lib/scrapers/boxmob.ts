import * as cheerio from 'cheerio'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE_URL = 'https://boxmob.jp/sp/schedule.html'
const TV_SCHEDULE_URL = 'https://boxmob.jp/sp/tv_schedule.html'

async function fetchShiftJis(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Boxmob fetch failed: ${res.status} ${url}`)
  const buf = await res.arrayBuffer()
  return new TextDecoder('shift-jis').decode(buf)
}

// Build sid → broadcast platform map from the TV schedule page.
// Each <tr> on that page contains "HH:MM～ Platform" and a link with ?sid=XXXX.
async function buildBroadcastMap(): Promise<Record<string, string>> {
  const html = await fetchShiftJis(TV_SCHEDULE_URL)
  const map: Record<string, string> = {}

  for (const m of html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)) {
    const tr = m[0]
    const sidMatch = tr.match(/[?&]sid=(\d+)/)
    if (!sidMatch) continue
    const sid = sidMatch[1]

    const platformMatch = tr.match(/\d{1,2}:\d{2}[～〜]\s*([^<\n\r]+)/)
    if (!platformMatch) continue
    const platform = platformMatch[1].trim()
    if (!platform) continue

    if (map[sid]) {
      if (!map[sid].includes(platform)) map[sid] = `${map[sid]} / ${platform}`
    } else {
      map[sid] = platform
    }
  }

  return map
}

// Infer the full year for an M/D date based on today's JST date.
// If the M/D date is more than 3 months in the past relative to today, bump year by 1.
function inferYear(month: number, day: number, todayJst: string): number {
  const todayYear = parseInt(todayJst.slice(0, 4))
  const candidate = new Date(todayYear, month - 1, day)
  const today = new Date(todayJst)
  const diffDays = (candidate.getTime() - today.getTime()) / 86_400_000
  if (diffDays < -90) return todayYear + 1
  return todayYear
}

function parseMD(text: string, todayJst: string): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  const month = parseInt(m[1])
  const day = parseInt(m[2])
  const year = inferYear(month, day, todayJst)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseTime(text: string): string | null {
  const m = text.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function parsePage(html: string, todayJst: string, broadcastMap: Record<string, string>): ScrapedEvent[] {
  const $ = cheerio.load(html)
  const events: ScrapedEvent[] = []

  $('div.schedule, div.schedule_attention').each((_, el) => {
    const $el = $(el)

    const dateText = $el.find('.schedule_left').text().trim()
    const eventDate = parseMD(dateText, todayJst)
    if (!eventDate) return
    if (eventDate < todayJst) return

    const $center2nd = $el.find('.schedule_center_2nd')
    const $link = $center2nd.find('a').first()

    const titleNode = $link.contents().filter((_, n) => n.type === 'text').first().text().trim()
    if (!titleNode) return

    const venueSpanText = $link.find('span').first().text()
    let location: string | null = null
    const venueMatch = venueSpanText.match(/会場[：:]\s*([^\s\n<]+(?:\s+[^\s\n<]+)*)/)
    if (venueMatch) {
      location = venueMatch[1].split(/\s*[\n\r入場]/)[0].trim() || null
    }

    let eventTime: string | null = null
    $center2nd.children('span').each((_, s) => {
      if (!eventTime) eventTime = parseTime($(s).text())
    })
    if (!eventTime) eventTime = parseTime(venueSpanText)

    const href = $link.attr('href') || ''
    const sidMatch = href.match(/[?&]sid=(\d+)/)
    const broadcastInfo = (sidMatch && broadcastMap[sidMatch[1]]) || null
    const sourceUrl = href ? new URL(href, BASE_URL).href : BASE_URL

    events.push({
      title: titleNode,
      event_date: eventDate,
      event_time: eventTime,
      location,
      broadcast_info: broadcastInfo,
      match_details: null,
      source: 'boxmob',
      source_url: sourceUrl,
    })
  })

  return events
}

// Fetch detail page and extract broadcast platform from div.tv_program_left img[alt]
async function fetchDetailBroadcast(sid: string): Promise<string | null> {
  try {
    const html = await fetchShiftJis(`https://boxmob.jp/sp/schedule/index.html?sid=${sid}`)
    const $ = cheerio.load(html)
    const platforms = $('.tv_program_left img').map((_, el) => $(el).attr('alt') || '').get().filter(Boolean)
    return platforms.length ? [...new Set(platforms)].join(' / ') : null
  } catch {
    return null
  }
}

export async function scrapeBoxmob(): Promise<ScrapedEvent[]> {
  const { toZonedTime, format: tzFormat } = await import('date-fns-tz')
  const nowJst = toZonedTime(new Date(), 'Asia/Tokyo')
  const todayJst = tzFormat(nowJst, 'yyyy-MM-dd', { timeZone: 'Asia/Tokyo' })

  const [page1, page2, broadcastMap] = await Promise.all([
    fetchShiftJis(BASE_URL),
    fetchShiftJis(`${BASE_URL}?s=2`),
    buildBroadcastMap(),
  ])

  const seen = new Set<string>()
  const events: ScrapedEvent[] = []

  for (const ev of [...parsePage(page1, todayJst, broadcastMap), ...parsePage(page2, todayJst, broadcastMap)]) {
    const key = `${ev.event_date}|${ev.title.toLowerCase().trim()}`
    if (!seen.has(key)) {
      seen.add(key)
      events.push(ev)
    }
  }

  // For events not found in tv_schedule.html, try individual detail pages
  const nullBroadcastEvs = events.filter(e => e.broadcast_info === null && e.source_url?.includes('sid='))
  await Promise.all(nullBroadcastEvs.map(async (e) => {
    const sidMatch = e.source_url!.match(/[?&]sid=(\d+)/)
    if (!sidMatch) return
    const platform = await fetchDetailBroadcast(sidMatch[1])
    if (platform) e.broadcast_info = platform
  }))

  return events
}
