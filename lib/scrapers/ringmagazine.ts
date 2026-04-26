import * as cheerio from 'cheerio'
import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const JST = 'Asia/Tokyo'

function convertToJST(dateStr: string, timeStr?: string): { date: string; time: string | null } {
  try {
    const datePart = dateStr.trim()
    const d = new Date(datePart)
    if (isNaN(d.getTime())) return { date: '', time: null }

    if (timeStr) {
      const tzMap: Record<string, string> = {
        EST: 'America/New_York', EDT: 'America/New_York',
        CST: 'America/Chicago', CDT: 'America/Chicago',
        PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
      }
      const tzAbbr = timeStr.match(/[A-Z]{2,4}$/)?.[0] || 'EST'
      const tz = tzMap[tzAbbr] || 'America/New_York'
      const timeOnly = timeStr.replace(/[A-Z]{2,4}$/, '').trim()
      const parsed = new Date(`${datePart} ${timeOnly}`)
      if (!isNaN(parsed.getTime())) {
        const jst = toZonedTime(parsed, JST)
        return {
          date: tzFormat(jst, 'yyyy-MM-dd', { timeZone: JST }),
          time: tzFormat(jst, 'HH:mm', { timeZone: JST }),
        }
      }
    }

    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      time: null,
    }
  } catch {
    return { date: '', time: null }
  }
}

export async function scrapeRingMagazine(existingTitles: string[]): Promise<ScrapedEvent[]> {
  const res = await fetch('https://www.ringmagazine.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error(`RingMagazine fetch failed: ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)
  const events: ScrapedEvent[] = []

  $('a[href*="/events/"]').each((_, el) => {
    const link = $(el)
    const href = link.attr('href') || ''
    if (!href.includes('/events/')) return

    const text = link.text().trim()
    if (!text || text.length < 5) return

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    const mainEvent = lines.find(l => l.includes(' vs ') || l.includes(' VS '))
    if (!mainEvent) return

    const dateLine = lines.find(l => /\d{1,2}(,\s*\d{4})?/.test(l) && /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(l))
    if (!dateLine) return

    const timeLine = lines.find(l => /\d+:\d+\s*[AP]M/i.test(l))
    const { date, time } = convertToJST(dateLine, timeLine)
    if (!date) return

    if (isDuplicate(mainEvent, date, existingTitles)) return

    const broadcast = lines.find(l =>
      /DAZN|ESPN|HBO|Showtime|Amazon|Netflix|PPV|Prime|Fox|NBC|ABC|Peacock|Apple|Sky|TNT/i.test(l)
    )

    events.push({
      title: mainEvent.trim(),
      event_date: date,
      event_time: time,
      location: null,
      broadcast_info: broadcast?.trim() || null,
      match_details: null,
      source: 'ringmagazine',
      source_url: href.startsWith('http') ? href : `https://www.ringmagazine.com${href}`,
    })
  })

  return events
}

function isDuplicate(title: string, date: string, existingTitles: string[]): boolean {
  const normalizeTitle = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9]/g, '').split('vs').sort().join('vs')

  const normalized = normalizeTitle(title)
  return existingTitles.some(existing => {
    const [existTitle] = existing.split('|')
    return normalizeTitle(existTitle) === normalized
  })
}
