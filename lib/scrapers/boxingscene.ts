import * as cheerio from 'cheerio'
import { toZonedTime, format as tzFormat } from 'date-fns-tz'
import { ScrapedEvent } from '@/types'

const JST = 'Asia/Tokyo'

function convertToJST(dateStr: string): { date: string; time: string | null } {
  try {
    const cleaned = dateStr.replace(/\s+/g, ' ').trim()
    // Pattern: "Wednesday | Apr 29, 2026 | 5:00 AM EST"
    const match = cleaned.match(/(\w+ \d+,?\s*\d{4})\s*\|?\s*(\d+:\d+\s*[AP]M\s*\w+)?/)
    if (!match) return { date: '', time: null }

    const datePart = match[1].replace(',', '').trim()
    const timePart = match[2]?.trim()

    const tzMap: Record<string, string> = {
      EST: 'America/New_York',
      EDT: 'America/New_York',
      CST: 'America/Chicago',
      CDT: 'America/Chicago',
      MST: 'America/Denver',
      MDT: 'America/Denver',
      PST: 'America/Los_Angeles',
      PDT: 'America/Los_Angeles',
    }

    let jstDate: string
    let jstTime: string | null = null

    if (timePart) {
      const tzAbbr = timePart.match(/[A-Z]{2,4}$/)?.[0] || 'EST'
      const tz = tzMap[tzAbbr] || 'America/New_York'
      const timeOnly = timePart.replace(/[A-Z]{2,4}$/, '').trim()
      const parsed = new Date(`${datePart} ${timeOnly}`)
      if (!isNaN(parsed.getTime())) {
        const inTz = toZonedTime(parsed, tz)
        const utcMs = parsed.getTime() - (inTz.getTime() - parsed.getTime())
        const jst = toZonedTime(new Date(utcMs), JST)
        jstDate = tzFormat(jst, 'yyyy-MM-dd', { timeZone: JST })
        jstTime = tzFormat(jst, 'HH:mm', { timeZone: JST })
      } else {
        jstDate = formatDate(datePart)
      }
    } else {
      jstDate = formatDate(datePart)
    }

    return { date: jstDate, time: jstTime }
  } catch {
    return { date: '', time: null }
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

export async function scrapeBoxingScene(): Promise<ScrapedEvent[]> {
  const res = await fetch('https://www.boxingscene.com/schedule', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error(`BoxingScene fetch failed: ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)
  const events: ScrapedEvent[] = []

  $('a[href*="/schedule/"], a[href*="/events/"]').each((_, el) => {
    const link = $(el)
    const text = link.text().trim()
    if (!text || text.length < 10) return

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return

    const dateLine = lines.find(l => /\d{4}/.test(l) && /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(l))
    if (!dateLine) return

    const { date, time } = convertToJST(dateLine)
    if (!date) return

    const mainEvent = lines.find(l => l.includes(' vs ') || l.includes(' VS '))
    if (!mainEvent) return

    const broadcast = lines.find(l =>
      /DAZN|ESPN|HBO|Showtime|Amazon|Netflix|PPV|Prime|Fox|NBC|ABC|Peacock|Apple|Sky|TNT/i.test(l)
    )
    const location = lines.find(l =>
      /,\s*[A-Z][a-z]/.test(l) && !l.includes(' vs ') && l !== dateLine
    )

    events.push({
      title: mainEvent.trim(),
      event_date: date,
      event_time: time,
      location: location?.trim() || null,
      broadcast_info: broadcast?.trim() || null,
      match_details: lines.filter(l => l.includes(' vs ') && l !== mainEvent).join(' | ') || null,
      source: 'boxingscene',
      source_url: link.attr('href') ? `https://www.boxingscene.com${link.attr('href')}` : null,
    })
  })

  return deduplicateByDate(events)
}

function deduplicateByDate(events: ScrapedEvent[]): ScrapedEvent[] {
  const seen = new Set<string>()
  return events.filter(e => {
    const key = `${e.event_date}|${e.title.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
