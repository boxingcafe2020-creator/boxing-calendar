const { scrapeBoxmob } = await import('../lib/scrapers/boxmob')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// 1. Check if Foster anchor with time header is in BoxingScene initial HTML
const html = await fetch('https://www.boxingscene.com/schedule', { headers: {'User-Agent': UA} }).then((r: any) => r.text())
// Search for foster href
const fosterAnchorIdx = html.indexOf('/events/oshaquie-foster')
console.log('Foster anchor in initial HTML:', fosterAnchorIdx !== -1)
if (fosterAnchorIdx !== -1) {
  // Find prev sibling text
  const before = html.slice(Math.max(0, fosterAnchorIdx - 500), fosterAnchorIdx)
  const timeMatch = before.match(/(Saturday|Sunday|Friday)[^|]+\|[^|]+\|[^"<\n]+/i)
  console.log('Time header near Foster:', timeMatch?.[0]?.trim())
  console.log('Context:', before.slice(-300))
}

// 2. Check Boxmob 5/2 events in detail - looking for any second THE DAY related entry
const bmEvents = await scrapeBoxmob()
const may2Events = bmEvents.filter(e => e.event_date <= '2026-05-03')
console.log('\nBoxmob events 5/2-5/3:')
for (const e of may2Events) console.log(JSON.stringify(e))
