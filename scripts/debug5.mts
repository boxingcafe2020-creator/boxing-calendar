const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// Check all sid=8015 occurrences across both Boxmob pages
for (const url of ['https://boxmob.jp/sp/schedule.html', 'https://boxmob.jp/sp/schedule.html?s=2']) {
  const buf = await fetch(url, { headers: {'User-Agent': UA} }).then((r: any) => r.arrayBuffer())
  const html = new TextDecoder('shift-jis').decode(buf)
  let pos = 0
  while ((pos = html.indexOf('sid=8015', pos)) !== -1) {
    // Find enclosing div
    const before = html.slice(0, pos)
    const divStart = before.lastIndexOf('<div class="schedule')
    const divEnd = html.indexOf('</div>\n</div>', pos) + 13
    console.log(`\n=== ${url} sid=8015 ===`)
    console.log(html.slice(divStart, Math.min(divStart+600, divEnd)))
    pos++
  }
}

// Also check the full Boxmob scraper output for all 5/2 events
const { scrapeBoxmob } = await import('../lib/scrapers/boxmob')
const events = await scrapeBoxmob()
const may2 = events.filter(e => e.event_date === '2026-05-02')
console.log('\nAll 5/2 Boxmob events:')
for (const e of may2) console.log(JSON.stringify(e))
