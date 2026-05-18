// Use the actual scrapers which already handle imports correctly
const { scrapeBoxingScene } = await import('../lib/scrapers/boxingscene')
const { scrapeBoxmob } = await import('../lib/scrapers/boxmob')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// 1. Check Foster in BoxingScene live
console.log('=== BoxingScene anchorInfo for Foster ===')
const bsEvents = await scrapeBoxingScene()
const foster = bsEvents.find(e => e.title.toLowerCase().includes('foster'))
console.log('Foster:', JSON.stringify(foster))
const angelo = bsEvents.find(e => e.title.toLowerCase().includes('angelo'))
console.log('Angelo:', JSON.stringify(angelo))

// 2. Check THE DAY on Boxmob raw
const buf = await fetch('https://boxmob.jp/sp/schedule.html', { headers: {'User-Agent': UA} }).then(r => r.arrayBuffer())
const html = new TextDecoder('shift-jis').decode(buf)
let pos = 0, count = 0
while ((pos = html.indexOf('THE DAY', pos)) !== -1) {
  count++
  const around = html.slice(Math.max(0,pos-200), pos+300)
  console.log(`\n=== THE DAY occurrence ${count} ===\n${around}`)
  pos++
}

// 3. Check Boxmob scraper output for THE DAY
console.log('\n=== Boxmob THE DAY events ===')
const bmEvents = await scrapeBoxmob()
for (const e of bmEvents.filter(e => e.title.includes('THE DAY') || e.title.includes('DAY'))) {
  console.log(JSON.stringify(e))
}
