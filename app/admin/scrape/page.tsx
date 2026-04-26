import { createClient } from '@/lib/supabase/server'
import ScrapePanel from './ScrapePanel'

export default async function ScrapePage() {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('scrape_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">スクレイピング</h1>
      <ScrapePanel logs={logs || []} />
    </div>
  )
}
