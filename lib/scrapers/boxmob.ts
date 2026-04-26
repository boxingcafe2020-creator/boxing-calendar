import { ScrapedEvent } from '@/types'

// Puppeteer + @sparticuz/chromium is only loaded at runtime (not during build)
async function getBrowser() {
  const chromium = (await import('@sparticuz/chromium')).default
  const puppeteer = (await import('puppeteer-core')).default
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
}

export async function scrapeBoxmob(): Promise<ScrapedEvent[]> {
  const rakutenId = process.env.RAKUTEN_ID
  const rakutenPassword = process.env.RAKUTEN_PASSWORD

  if (!rakutenId || !rakutenPassword) {
    throw new Error('楽天IDまたはパスワードが設定されていません')
  }

  const browser = await getBrowser()
  const events: ScrapedEvent[] = []

  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')

    // boxmob.jpのログインページに移動
    await page.goto('https://boxmob.jp/sp/login', { waitUntil: 'networkidle2', timeout: 30000 })

    // 楽天ログインボタンを探してクリック
    const rakutenBtn = await page.$('a[href*="rakuten"], button[class*="rakuten"], img[alt*="楽天"]')
    if (rakutenBtn) {
      await rakutenBtn.click()
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
    }

    // 楽天ログインフォームに入力
    await page.waitForSelector('input[name="u"], input[id*="loginInner_u"], input[type="email"]', { timeout: 15000 })
    const idSelector = await page.$('input[name="u"]') || await page.$('input[id*="loginInner_u"]') || await page.$('input[type="email"]')
    const pwSelector = await page.$('input[name="p"]') || await page.$('input[id*="loginInner_p"]') || await page.$('input[type="password"]')

    if (!idSelector || !pwSelector) throw new Error('楽天ログインフォームが見つかりません')

    await idSelector.type(rakutenId, { delay: 50 })
    await pwSelector.type(rakutenPassword, { delay: 50 })

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.keyboard.press('Enter'),
    ])

    // スケジュールページへ移動
    await page.goto('https://boxmob.jp/sp/schedule.html', { waitUntil: 'networkidle2', timeout: 30000 })

    const content = await page.content()
    const { load } = await import('cheerio')
    const $ = load(content)

    // 試合情報を抽出（実際のHTMLに合わせてセレクタを調整）
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

    // セレクタで取れない場合、テキスト全体からパース
    if (events.length === 0) {
      $('body').find('*').each((_, el) => {
        const text = $(el).children().length === 0 ? $(el).text().trim() : ''
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
  } finally {
    await browser.close()
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
