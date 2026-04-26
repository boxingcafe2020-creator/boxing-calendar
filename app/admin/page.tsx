import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [{ count: totalEvents }, { data: logs }, { data: recentEvents }] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true }),
    supabase.from('scrape_logs').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('events').select('*').order('event_date', { ascending: true }).gte('event_date', new Date().toISOString().slice(0, 10)).limit(5),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="登録イベント数" value={totalEvents ?? 0} unit="件" />
        <StatCard label="直近のイベント" value={recentEvents?.length ?? 0} unit="件" />
        <StatCard label="最終スクレイプ" value={logs?.[0] ? formatDate(logs[0].created_at) : '未実行'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">直近の予定イベント</h2>
          {recentEvents && recentEvents.length > 0 ? (
            <ul className="space-y-3">
              {recentEvents.map(e => (
                <li key={e.id} className="flex justify-between items-center text-sm">
                  <span className="text-gray-900 font-medium truncate max-w-xs">{e.title}</span>
                  <span className="text-gray-500 ml-3 shrink-0">{e.event_date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-sm">予定イベントはありません</p>
          )}
          <Link href="/admin/events" className="block mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium">
            すべて見る →
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">スクレイピングログ</h2>
          {logs && logs.length > 0 ? (
            <ul className="space-y-3">
              {logs.map(log => (
                <li key={log.id} className="flex items-start gap-3 text-sm">
                  <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <span className="font-medium text-gray-900">{log.source}</span>
                    <span className="text-gray-500 ml-2">{log.message}</span>
                    <div className="text-gray-400 text-xs mt-0.5">{formatDate(log.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-sm">ログはありません</p>
          )}
          <Link href="/admin/scrape" className="block mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium">
            スクレイピング実行 →
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">
        {value}{unit && <span className="text-base font-normal text-gray-500 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
