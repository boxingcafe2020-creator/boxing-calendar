'use client'

import { BoxingEvent } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Props {
  event: BoxingEvent
  onClose: () => void
}

export default function EventDetailModal({ event, onClose }: Props) {
  const dateLabel = formatDate(event.event_date, event.event_time)
  const gcUrl = buildGoogleCalendarUrl(event)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
            {sourceLabel(event.source)}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-4">{event.title}</h2>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-gray-500 font-medium">日時</dt>
            <dd className="text-gray-900">{dateLabel}</dd>
          </div>
          {event.location && (
            <div>
              <dt className="text-gray-500 font-medium">場所</dt>
              <dd className="text-gray-900">{event.location}</dd>
            </div>
          )}
          {event.broadcast_info && (
            <div>
              <dt className="text-gray-500 font-medium">配信・放送</dt>
              <dd className="text-gray-900">{event.broadcast_info}</dd>
            </div>
          )}
          {event.match_details && (
            <div>
              <dt className="text-gray-500 font-medium">試合情報</dt>
              <dd className="text-gray-900 whitespace-pre-line">{event.match_details}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-col gap-2">
          <a
            href={gcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-4 text-sm font-medium transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
            </svg>
            Googleカレンダーに追加
          </a>
          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl py-3 px-4 text-sm font-medium transition"
            >
              詳細を見る →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDate(date: string, time: string | null): string {
  try {
    const d = new Date(date)
    const base = format(d, 'yyyy年M月d日(E)', { locale: ja })
    return time ? `${base} ${time} (JST)` : base
  } catch {
    return date
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'boxmob': return 'Boxmob'
    case 'boxingscene': return 'BoxingScene'
    default: return '手動登録'
  }
}

function buildGoogleCalendarUrl(event: BoxingEvent): string {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  const title = encodeURIComponent(event.title)

  const startDate = event.event_date.replace(/-/g, '')
  let dates: string
  if (event.event_time) {
    const start = `${startDate}T${event.event_time.replace(':', '')}00`
    const endHour = parseInt(event.event_time.split(':')[0]) + 3
    const end = `${startDate}T${String(endHour).padStart(2, '0')}${event.event_time.split(':')[1]}00`
    dates = `${start}/${end}`
  } else {
    const next = new Date(event.event_date)
    next.setDate(next.getDate() + 1)
    const endDate = next.toISOString().slice(0, 10).replace(/-/g, '')
    dates = `${startDate}/${endDate}`
  }

  const details = [
    event.broadcast_info && `配信: ${event.broadcast_info}`,
    event.match_details && `試合: ${event.match_details}`,
    event.source_url && `詳細: ${event.source_url}`,
  ].filter(Boolean).join('\n')

  return `${base}&text=${title}&dates=${dates}${event.location ? `&location=${encodeURIComponent(event.location)}` : ''}&details=${encodeURIComponent(details)}&ctz=Asia%2FTokyo`
}
