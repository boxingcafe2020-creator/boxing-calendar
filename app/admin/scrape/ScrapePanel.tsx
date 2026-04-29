'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScrapeLog } from '@/types'

interface Props {
  logs: ScrapeLog[]
}

export default function ScrapePanel({ logs }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  const handleScrape = async () => {
    if (!confirm('スクレイピングを実行しますか？（数分かかる場合があります）')) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/scrape', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const r = data.results
        setResult(`完了: BoxingScene ${r.boxingscene}件 追加/更新${r.errors?.length > 0 ? `\nエラー: ${r.errors.join(', ')}` : ''}`)
      } else {
        setResult(`エラー: ${data.error}`)
      }
    } catch (e) {
      setResult('通信エラーが発生しました')
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-2">手動スクレイピング実行</h2>
        <p className="text-sm text-gray-500 mb-4">
          BoxingSceneから最新の試合情報を取得します。自動収集は毎週月曜日に実行されます。
        </p>

        <div className="space-y-3 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>boxingscene.com（全件取得・日本時間に変換）</span>
          </div>
        </div>

        <button
          onClick={handleScrape}
          disabled={loading}
          className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              実行中...
            </>
          ) : '今すぐ実行'}
        </button>

        {result && (
          <div className={`mt-4 p-4 rounded-lg text-sm whitespace-pre-line ${result.includes('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {result}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">実行ログ（直近20件）</h2>
        {logs.length > 0 ? (
          <div className="space-y-3">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-3 last:border-0">
                <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{log.source}</span>
                    {log.status === 'success' && log.events_added > 0 && (
                      <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">+{log.events_added}件</span>
                    )}
                  </div>
                  <div className="text-gray-500 mt-0.5">{log.message}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{formatDate(log.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">ログはありません</p>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
