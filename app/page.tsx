import { createClient } from '@/lib/supabase/server'
import CalendarWrapper from '@/components/CalendarWrapper'

export const revalidate = 3600

export default async function Home() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: true })

  return (
    <div className="min-h-screen">
      <header className="bg-gray-900 text-white py-4 px-6 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-wide">🥊 Shinta's Boxing Calendar</h1>
          <span className="text-gray-400 text-sm hidden sm:block">Boxing schedule, Japan</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-6 px-4">
        <CalendarWrapper events={events || []} />
      </main>

      <footer className="text-center text-gray-400 text-xs py-6">
        イベントをクリックするとGoogleカレンダーへ追加できます
      </footer>
    </div>
  )
}
