'use client'

import { BoxingEvent } from '@/types'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  event?: BoxingEvent
}

export default function EventForm({ event }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: event?.title || '',
    event_date: event?.event_date || '',
    event_time: event?.event_time || '',
    location: event?.location || '',
    broadcast_info: event?.broadcast_info || '',
    match_details: event?.match_details || '',
    source_url: event?.source_url || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      ...form,
      event_time: form.event_time || null,
      location: form.location || null,
      broadcast_info: form.broadcast_info || null,
      match_details: form.match_details || null,
      source_url: form.source_url || null,
      source: event?.source || 'manual',
    }

    const res = await fetch(event ? `/api/events/${event.id}` : '/api/events', {
      method: event ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'エラーが発生しました')
      setLoading(false)
      return
    }

    router.push('/admin/events')
    router.refresh()
  }

  const handleDelete = async () => {
    if (!event || !confirm('このイベントを削除しますか？')) return
    const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/admin/events')
      router.refresh()
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {field('イベント名（メインイベント）', 'title', 'text', true)}
      {field('日付', 'event_date', 'date', true)}
      {field('開始時刻 (JST)', 'event_time', 'time')}
      {field('場所', 'location')}
      {field('配信・放送情報', 'broadcast_info')}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">試合情報</label>
        <textarea
          value={form.match_details}
          onChange={e => setForm(f => ({ ...f, match_details: e.target.value }))}
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="各試合を改行で入力"
        />
      </div>

      {field('参照URL', 'source_url', 'url')}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium transition"
        >
          {loading ? '保存中...' : event ? '更新する' : '登録する'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg px-5 py-2 text-sm font-medium transition"
        >
          キャンセル
        </button>
        {event && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg px-5 py-2 text-sm font-medium transition"
          >
            削除
          </button>
        )}
      </div>
    </form>
  )
}
