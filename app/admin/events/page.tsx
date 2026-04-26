import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminEvents() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">イベント管理</h1>
        <Link
          href="/admin/events/new"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition"
        >
          + 新規追加
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 text-gray-500 font-medium">日付</th>
              <th className="text-left px-6 py-3 text-gray-500 font-medium">イベント名</th>
              <th className="text-left px-6 py-3 text-gray-500 font-medium hidden md:table-cell">配信</th>
              <th className="text-left px-6 py-3 text-gray-500 font-medium hidden md:table-cell">ソース</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {events?.map(event => (
              <tr key={event.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{event.event_date}</td>
                <td className="px-6 py-4 font-medium text-gray-900 max-w-xs truncate">{event.title}</td>
                <td className="px-6 py-4 text-gray-500 hidden md:table-cell max-w-xs truncate">{event.broadcast_info || '—'}</td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${sourceStyle(event.source)}`}>
                    {event.source}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
            {(!events || events.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  イベントが登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function sourceStyle(source: string): string {
  switch (source) {
    case 'boxmob': return 'bg-red-50 text-red-600'
    case 'boxingscene': return 'bg-green-50 text-green-600'
    case 'ringmagazine': return 'bg-purple-50 text-purple-600'
    default: return 'bg-blue-50 text-blue-600'
  }
}
