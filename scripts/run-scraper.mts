const { runAllScrapers } = await import('../lib/scrapers/index')

console.log('Starting scrapers...')
const results = await runAllScrapers()
console.log('Done:', JSON.stringify(results, null, 2))
