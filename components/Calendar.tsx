'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { BoxingEvent } from '@/types'
import { useState, useEffect, useMemo } from 'react'
import EventDetailModal from './EventDetailModal'

interface Props {
  events: BoxingEvent[]
}

// Merge variant names into a single canonical label
function normalizePlatform(raw: string): string {
  const s = raw.trim()
  if (/^WOWOW/i.test(s))                          return 'WOWOW'
  if (/^ESPN/i.test(s))                            return 'ESPN'
  if (/^ProBox/i.test(s))                          return 'ProBox'
  if (/^ABEMA/i.test(s))                           return 'ABEMA TV'
  if (/^Amazon\s*Prime|^Prime\s*Video/i.test(s))   return 'Amazon Prime'
  if (/^YouTube|^Youtube/i.test(s))                return 'YouTube'
  return s
}

const PLATFORM_ORDER = [
  'ABEMA TV', 'Amazon Prime', 'Boxing Raise', 'Lemino',
  'WOWOW', 'U-NEXT', 'Netflix', 'DAZN', 'ProBox', 'YouTube',
]

function sortPlatforms(platforms: string[]): string[] {
  return [...platforms].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a)
    const bi = PLATFORM_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b, 'ja')
  })
}

export default function Calendar({ events }: Props) {
  const [selected, setSelected] = useState<BoxingEvent | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Collect unique normalized broadcast platforms across all events
  const platforms = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      if (e.broadcast_info) {
        for (const p of e.broadcast_info.split(' / ')) {
          const n = normalizePlatform(p)
          if (n) set.add(n)
        }
      }
    }
    return sortPlatforms([...set])
  }, [events])

  // Filter events by selected normalized platform
  const filteredEvents = useMemo(() => {
    if (!selectedPlatform) return events
    return events.filter(e => {
      if (!e.broadcast_info) return false
      return e.broadcast_info.split(' / ').map(normalizePlatform).includes(selectedPlatform)
    })
  }, [events, selectedPlatform])

  const calendarEvents = filteredEvents.map(e => {
    const hasBroadcast = !!e.broadcast_info
    const color = sourceColor(e.source)
    return {
      id: e.id,
      title: e.title,
      start: e.event_date,
      allDay: true,
      extendedProps: e,
      backgroundColor: hasBroadcast ? color : 'transparent',
      borderColor: hasBroadcast ? color : 'transparent',
      textColor: hasBroadcast ? '#ffffff' : color,
    }
  })

  // Mobile: use dayGridWeek (no time-slot columns → no overlap) instead of timeGridWeek
  const headerToolbar = isMobile
    ? { left: 'prev,next', center: 'title', right: 'dayGridMonth,dayGridWeek,listMonth' }
    : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }

  const buttonText = { today: '今日', month: '月', week: '週', list: 'リスト' }

  return (
    <div className="p-4">
      {/* Platform filter */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedPlatform(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            selectedPlatform === null
              ? 'bg-gray-800 text-white border-gray-800'
              : 'text-gray-600 border-gray-300 hover:border-gray-500 hover:text-gray-800'
          }`}
        >
          すべて
        </button>
        {platforms.map(p => (
          <button
            key={p}
            onClick={() => setSelectedPlatform(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              selectedPlatform === p
                ? 'bg-gray-800 text-white border-gray-800'
                : 'text-gray-600 border-gray-300 hover:border-gray-500 hover:text-gray-800'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block px-2 py-0.5 rounded bg-green-500 text-white text-xs font-medium">緑</span>
          海外ソース（配信あり）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block px-2 py-0.5 rounded bg-red-500 text-white text-xs font-medium">赤</span>
          国内ソース（配信あり）
        </span>
        <span className="flex items-center gap-1.5 text-gray-400">
          テキストのみ = 配信情報なし
        </span>
      </div>

      <FullCalendar
        key={isMobile ? 'mobile' : 'desktop'}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={headerToolbar}
        buttonText={buttonText}
        locale="ja"
        displayEventTime={false}
        events={calendarEvents}
        eventContent={(arg) => {
          const e = arg.event.extendedProps as BoxingEvent
          const hasBroadcast = !!e.broadcast_info
          const color = sourceColor(e.source)
          const title = arg.event.title
          return hasBroadcast ? (
            <span style={{
              display: 'block',
              backgroundColor: color,
              color: '#fff',
              borderRadius: '3px',
              padding: '0 4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.85em',
              lineHeight: '1.4',
            }}>
              {title}
            </span>
          ) : (
            <span style={{
              display: 'block',
              color,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.85em',
              lineHeight: '1.4',
            }}>
              {title}
            </span>
          )
        }}
        eventClick={info => setSelected(info.event.extendedProps as BoxingEvent)}
        height="auto"
      />
      {selected && (
        <EventDetailModal event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function sourceColor(source: string) {
  switch (source) {
    case 'boxmob': return '#ef4444'
    case 'boxingscene': return '#22c55e'
    default: return '#3b82f6'
  }
}
