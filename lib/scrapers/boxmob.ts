import * as cheerio from 'cheerio'
import { ScrapedEvent } from '@/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

class CookieJar {
  private store = new Map<string, string>()

  ingest(res: Response) {
    // Node 18.14+ exposes getSetCookie() for proper multi-value support
    const h = res.headers as Headers & { getSetCookie?: () => string[] }
    const list: string[] = typeof h.getSetCookie === 'function'
      ? h.getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[^;=,\s]+=)/).filter(Boolean)

    for (const raw of list) {
      const nameVal = raw.split(';')[0]
      const eq = nameVal.indexOf('=')
      if (eq > 0) {
        this.store.set(nameVal.slice(0, eq).trim(), nameVal.slice(eq + 1).trim())
      }
    }
  }

  header(): string {
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

async function httpFetch(
  startUrl: string,
  jar: CookieJar,
  method = 'GET',
  body?: string,
  extraHeaders: Record<string, string> = {},
  maxRedirects = 10
): Promise<{ html: string; finalUrl: string }> {
  let url = startUrl
  let curMethod = method
  let curBody = body
  let curExtra = extraHeaders

  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(url, {
      method: curMethod,
      body: curBody,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9',
        'Cookie': jar.header(),
        ...curExtra,
      },
    })

    jar.ingest(res)

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || ''
      url = loc.startsWith('http') ? loc : new URL(loc, url).href
      curMethod = 'GET'
      curBody = undefined
      curExtra = {}
      continue
    }

    return { html: await res.text(), finalUrl: url }
  }

  throw new Error('Too many redirects')
}

export async function scrapeBoxmob(): Promise<ScrapedEvent[]> {
  const rakutenId = process.env.RAKUTEN_ID
  const rakutenPassword = process.env.RAKUTEN_PASSWORD

  if (!rakutenId || !rakutenPassword) {
    throw new Error('楽天IDまたはパスワードが設定されていません')
  }

  const jar = new CookieJar()

  // Step 1: Load boxmob login page and find the Rakuten OAuth link
  const { html: loginHtml, finalUrl: loginPageUrl } = await httpFetch('https://boxmob.jp/sp/login', jar)
  const $login = cheerio.load(loginHtml)

  let rakutenAuthUrl = ''
  $login('a[href]').each((_, el) => {
    if (rakutenAuthUrl) return
    const href = $login(el).attr('href') || ''
    if (href.includes('rakuten') || href.includes('oauth')) {
      rakutenAuthUrl = href.startsWith('http') ? href : new URL(href, loginPageUrl).href
    }
  })

  if (!rakutenAuthUrl) {
    throw new Error('楽天ログインリンクが見つかりません')
  }

  // Step 2: Go to Rakuten OAuth page (may involve multiple redirects)
  const { html: authHtml, finalUrl: authUrl } = await httpFetch(rakutenAuthUrl, jar)
  const $auth = cheerio.load(authHtml)

  // Find the login form
  const $form = $auth('form').first()
  const rawAction = $form.attr('action') || authUrl
  const formAction = rawAction.startsWith('http') ? rawAction : new URL(rawAction, authUrl).href

  // Collect hidden inputs (CSRF tokens etc.)
  const fields: Record<string, string> = {}
  $form.find('input[type="hidden"]').each((_, el) => {
    const name = $auth(el).attr('name')
    const value = $auth(el).attr('value') ?? ''
    if (name) fields[name] = value
  })

  // Detect the username/password field names (Rakuten uses 'u' and 'p')
  const idInput = $form.find('input[name="u"], input[name="userId"], input[type="email"], input[type="text"]').first()
  const pwInput = $form.find('input[name="p"], input[name="password"], input[type="password"]').first()
  fields[idInput.attr('name') || 'u'] = rakutenId
  fields[pwInput.attr('name') || 'p'] = rakutenPassword

  // Step 3: Submit login form
  const postBody = new URLSearchParams(fields).toString()
  await httpFetch(formAction, jar, 'POST', postBody, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': authUrl,
  })

  // Step 4: Fetch schedule page with the session cookie
  const { html: scheduleHtml } = await httpFetch('https://boxmob.jp/sp/schedule.html', jar)

  return parseSchedule(scheduleHtml)
}

function parseSchedule(html: string): ScrapedEvent[] {
  const $ = cheerio.load(html)
  const events: ScrapedEvent[] = []

  $('.schedule-item, .event-item, [class*="schedule"], [class*="event"]').each((_, el) => {
    const item = $(el)
    const dateText = item.find('[class*="date"], time, .date').first().text().trim()
    const titleText = item.find('[class*="title"], h2, h3, .title').first().text().trim()
    const broadcastText = item.find('[class*="broadcast"], [class*="tv"], [class*="stream"]').first().text().trim()
    const matchText = item.find('[class*="match"], [class*="bout"]').text().trim()

    if (!dateText || !titleText) return

    const date = parseJapaneseDate(dateText)
    if (!date) return

    events.push({
      title: titleText,
      event_date: date.date,
      event_time: date.time,
      location: null,
      broadcast_info: broadcastText || null,
      match_details: matchText || null,
      source: 'boxmob',
      source_url: 'https://boxmob.jp/sp/schedule.html',
    })
  })

  // Fallback: extract date-containing leaf text nodes
  if (events.length === 0) {
    $('body *').each((_, el) => {
      if ($(el).children().length > 0) return
      const text = $(el).text().trim()
      if (text.match(/\d{4}年\d{1,2}月\d{1,2}日/) && text.length < 200) {
        const date = parseJapaneseDate(text)
        if (date) {
          events.push({
            title: text.substring(0, 100),
            event_date: date.date,
            event_time: date.time,
            location: null,
            broadcast_info: null,
            match_details: null,
            source: 'boxmob',
            source_url: 'https://boxmob.jp/sp/schedule.html',
          })
        }
      }
    })
  }

  return events
}

function parseJapaneseDate(text: string): { date: string; time: string | null } | null {
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!match) return null

  const year = match[1]
  const month = match[2].padStart(2, '0')
  const day = match[3].padStart(2, '0')

  const timeMatch = text.match(/(\d{1,2}):(\d{2})/)
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null

  return { date: `${year}-${month}-${day}`, time }
}
