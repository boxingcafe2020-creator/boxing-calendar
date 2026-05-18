const { createClient } = await import('../lib/supabase/client')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// Use service role key directly
const { createClient: create } = await import('@supabase/supabase-js')
const supabase = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: events } = await supabase.from('events').select('id,title,event_date,broadcast_info,source').order('event_date')
const angelo = events?.filter((e: any) => e.title.includes('Angelo') || e.title.includes('Leo'))
const welter = events?.filter((e: any) => e.title.includes('ウェルター'))
const theday = events?.filter((e: any) => e.title.includes('THE DAY'))
console.log('Angelo in DB:', JSON.stringify(angelo, null, 2))
console.log('Welterweight in DB:', JSON.stringify(welter, null, 2))
console.log('THE DAY in DB:', JSON.stringify(theday, null, 2))

// Check page 2 for THE DAY
const buf = await fetch('https://boxmob.jp/sp/schedule.html?s=2', { headers: {'User-Agent': UA} }).then((r: any) => r.arrayBuffer())
const html = new TextDecoder('shift-jis').decode(buf)
let pos = 0
while ((pos = html.indexOf('THE DAY', pos)) !== -1) {
  console.log('\nTHE DAY on page2:', html.slice(Math.max(0,pos-100), pos+200))
  pos++
}
