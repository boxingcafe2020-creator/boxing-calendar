const { scrapeBoxmob } = await import('../lib/scrapers/boxmob')

// Check Boxmob for Azim or Claggett
const events = (await scrapeBoxmob()) as any[]
const azim = events.filter(e =>
  e.title.toLowerCase().includes('azim') ||
  e.title.toLowerCase().includes('claggett') ||
  e.event_date === '2026-05-31' ||
  e.event_date === '2026-05-30'
)
console.log('Boxmob 5/30-5/31 events:')
for (const e of azim) console.log(JSON.stringify(e))

// Also check what the BoxingScene server action returns for Azim
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const schedHtml = await fetch('https://www.boxingscene.com/schedule', { headers: {'User-Agent': UA} }).then((r: any) => r.text())
// Find Azim in the schedule HTML
const azimIdx = schedHtml.indexOf('azim')
console.log('\nAzim in schedule HTML:', azimIdx !== -1)
if (azimIdx !== -1) console.log('Context:', schedHtml.slice(Math.max(0, azimIdx-300), azimIdx+200))

// Check what event_time/networks the API returns for Azim
const ACTION_ID = '7f4b36036e955f48bf1ea1c93d1030f6ad6540be72'
const idMatch = schedHtml.match(/\\"last_event_id\\":(\d+)/)
const dateMatch = schedHtml.match(/\\"last_event_date\\":\\"([^\\]+)\\"/)
if (idMatch && dateMatch) {
  let cursor = { last_event_id: parseInt(idMatch[1]), last_event_date: dateMatch[1] }
  let found = false
  for (let i = 0; i < 10 && !found; i++) {
    const res = await fetch('https://www.boxingscene.com/schedule', {
      method: 'POST', cache: 'no-store',
      headers: { 'User-Agent': UA, 'Next-Action': ACTION_ID, 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'text/x-component', 'Origin': 'https://www.boxingscene.com', 'Referer': 'https://www.boxingscene.com/schedule' },
      body: JSON.stringify(['get_upcoming_events', cursor]),
    })
    const text = await res.text()
    if (text.toLowerCase().includes('azim')) {
      console.log('\nFound Azim in API page', i+1)
      const start = text.toLowerCase().indexOf('azim')
      console.log('Context:', text.slice(Math.max(0, start-200), start+300))
      found = true
    }
    // Parse cursor
    const marker = '{"config":'
    const s = text.lastIndexOf(marker)
    if (s === -1) break
    let depth = 0, end = -1
    for (let j = s; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') { depth--; if (depth === 0) { end = j+1; break } }
    }
    if (end === -1) break
    try {
      const parsed = JSON.parse(text.slice(s, end))
      const nextArgs = parsed.next_command?.args
      if (!nextArgs?.last_event_id) break
      cursor = nextArgs
    } catch { break }
  }
}
