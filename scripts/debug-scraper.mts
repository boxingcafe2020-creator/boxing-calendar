const { scrapeBoxingScene } = await import('../lib/scrapers/boxingscene')
const { scrapeBoxmob } = await import('../lib/scrapers/boxmob')

console.log('=== BoxingScene ===')
const bsEvents = await scrapeBoxingScene()
for (const e of bsEvents) {
  if (e.title.toLowerCase().includes('foster') || e.title.toLowerCase().includes('angelo') || e.title.toLowerCase().includes('leo')) {
    console.log(JSON.stringify(e))
  }
}

console.log('\n=== Boxmob ===')
const bmEvents = await scrapeBoxmob()
for (const e of bmEvents) {
  if (e.title.includes('ウェルター') || e.title.includes('Foster') || e.title.includes('WBA')) {
    console.log(JSON.stringify(e))
  }
}
// Also show all Boxmob events sorted by date
console.log('\n=== All Boxmob events ===')
for (const e of bmEvents.sort((a,b) => a.event_date.localeCompare(b.event_date))) {
  console.log(`${e.event_date} ${e.event_time || '----'} | ${e.title} | broadcast: ${e.broadcast_info}`)
}
