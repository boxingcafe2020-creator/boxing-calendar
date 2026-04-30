import * as cheerio from 'cheerio'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE_URL = 'https://boxmob.jp/sp/schedule.html'

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

// Infer the full year for an M/D date based on today's JST date.
// If the M/D date is more than 3 months in the past relative to today, bump year by 1.
function inferYear(month: number, day: number, todayJst: string): number {
  const todayYear = parseInt(todayJst.slice(0, 4))
  const todayMonth = parseInt(todayJst.slice(5, 7))
  const candidate = new Date(todayYear, month - 1, day)
  const today = new Date(todayJst)
  const diffMs = candidate.getTime() - today.getTime()
  const diffDays = diffMs / 86_400_000
  if (diffDays < -90) return todayYear + 1
  return todayYear
}

function parseMD(text: string, todayJst: string): string | null {
  // "5/2" or "12/31"
  const m = text.match(/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  const month = parseInt(m[1])
  const day = parseInt(m[2])
  const year = inferYear(month, day, todayJst)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseTime(text: string): string | null {
  // "14:00 開始" or "14:30開始予定"
  const m = text.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function parsePage(html: string, todayJst: string): ScrapedEvent[] {
  const $ = cheerio.load(html)
  const events: ScrapedEvent[] = []

  $('div.schedule, div.schedule_attention').each((_, el) => {
    const $el = $(el)

    // Date from schedule_left: "5/2" with week image below
    const dateText = $el.find('.schedule_left').text().trim()
    const eventDate = parseMD(dateText, todayJst)
    if (!eventDate) return
    if (eventDate < todayJst) return

    const $center2nd = $el.find('.schedule_center_2nd')
    const $link = $center2nd.find('a').first()

    // Title: direct text of <a> before the <span> child
    const titleNode = $link.contents().filter((_, n) => n.type === 'text').first().text().trim()
    if (!titleNode) return

    // Venue: text inside <span> within <a>, after "会場："
    const venueSpanText = $link.find('span').first().text()
    let location: string | null = null
    const venueMatch = venueSpanText.match(/会場[：:]\s*([^\s\n<]+(?:\s+[^\s\n<]+)*)/)
    if (venueMatch) {
      location = venueMatch[1].split(/\s*[\n\r入場]/)[0].trim() || null
    }

    // Time: check <span> outside <a> in schedule_center_2nd first, then inside venue span
    let eventTime: string | null = null
    $center2nd.children('span').each((_, s) => {
      if (!eventTime) eventTime = parseTime($(s).text())
    })
    if (!eventTime) eventTime = parseTime(venueSpanText)

    // Source URL: the href from the link
    const href = $link.attr('href') || ''
    const sourceUrl = href ? new URL(href, BASE_URL).href : BASE_URL

    events.push({
      title: titleNode,
      event_date: eventDate,
      event_time: eventTime,
      location,
      broadcast_info: null,
      match_details: null,
      source: 'boxmob',
      source_url: sourceUrl,
    })
  })

  return events
}

export async function scrapeBoxmob(): Promise<ScrapedEvent[]> {
  const { toZonedTime, format: tzFormat } = await import('date-fns-tz')
  const nowJst = toZonedTime(new Date(), 'Asia/Tokyo')
  const todayJst = tzFormat(nowJst, 'yyyy-MM-dd', { timeZone: 'Asia/Tokyo' })

  const [page1, page2] = await Promise.all([
    fetchShiftJis(BASE_URL),
    fetchShiftJis(`${BASE_URL}?s=2`),
  ])

  const seen = new Set<string>()
  const events: ScrapedEvent[] = []

  for (const ev of [...parsePage(page1, todayJst), ...parsePage(page2, todayJst)]) {
    const key = `${ev.event_date}|${ev.title.toLowerCase().trim()}`
    if (!seen.has(key)) {
      seen.add(key)
      events.push(ev)
    }
  }

  return events
}
