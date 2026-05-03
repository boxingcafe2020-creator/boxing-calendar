'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { BoxingEvent } from '@/types'
import { useState, useEffect, useMemo, useRef } from 'react'
import EventDetailModal from './EventDetailModal'

interface Props {
  events: BoxingEvent[]
}

type ViewType = 'month' | 'week' | 'list'

const JP_DAYS = ['月', '火', '水', '木', '金', '土', '日']

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + diff)
  return date
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

function sourceColor(source: string) {
  switch (source) {
    case 'boxmob': return '#ef4444'
    case 'boxingscene': return '#22c55e'
    default: return '#3b82f6'
  }
}

export default function Calendar({ events }: Props) {
  const [selected, setSelected] = useState<BoxingEvent | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
  const [view, setView] = useState<ViewType>('month')
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const calRef = useRef<FullCalendar>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Sync FullCalendar view when switching away from week
  const switchView = (v: ViewType) => {
    setView(v)
    if (v !== 'week' && calRef.current) {
      const api = calRef.current.getApi()
      api.gotoDate(weekStart)
      api.changeView(v === 'list' ? 'listMonth' : 'dayGridMonth')
    }
  }

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

  // Week view: 7 days from Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const weekEndDate = weekDays[6]
  const todayStr = toDateStr(new Date())
  const weekLabel = weekStart.getMonth() === weekEndDate.getMonth()
    ? `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日〜${weekEndDate.getDate()}日`
    : `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日〜${weekEndDate.getMonth() + 1}月${weekEndDate.getDate()}日`

  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }
  const goToday = () => setWeekStart(getMonday(new Date()))

  const fcHeaderToolbar = isMobile
    ? { left: 'prev,next', center: 'title', right: '' }
    : { left: 'prev,next today', center: 'title', right: '' }

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

      {/* Custom view tab bar */}
      <div className="mb-3 flex gap-1">
        {(['month', 'week', 'list'] as const).map(v => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              view === v
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {v === 'month' ? '月' : v === 'week' ? '週' : 'リスト'}
          </button>
        ))}
      </div>

      {/* Custom vertical week view */}
      {view === 'week' && (
        <div>
          {/* Week navigation */}
          <div className="flex items-center gap-2 mb-4">
            <button onClick={prevWeek} className="px-2 py-1 rounded border border-gray-300 text-sm hover:bg-gray-50">‹</button>
            <button onClick={nextWeek} className="px-2 py-1 rounded border border-gray-300 text-sm hover:bg-gray-50">›</button>
            <button onClick={goToday} className="px-2 py-1 rounded border border-gray-300 text-sm hover:bg-gray-50">今日</button>
            <span className="text-sm font-medium text-gray-700 ml-1">{weekLabel}</span>
          </div>

          {/* Day rows */}
          <div className="flex flex-col gap-2">
            {weekDays.map((day, i) => {
              const dateStr = toDateStr(day)
              const isToday = dateStr === todayStr
              const isSat = i === 5
              const isSun = i === 6
              const dayEvents = filteredEvents.filter(e => e.event_date === dateStr)

              return (
                <div
                  key={dateStr}
                  className={`rounded-lg border ${isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                >
                  {/* Day header */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b ${
                    isToday ? 'border-blue-200 bg-blue-100' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <span className={`text-sm font-bold w-5 text-center ${
                      isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'
                    }`}>
                      {JP_DAYS[i]}
                    </span>
                    <span className={`text-sm ${isToday ? 'font-bold text-blue-700' : 'text-gray-600'}`}>
                      {day.getMonth() + 1}/{day.getDate()}
                      {isToday && <span className="ml-1 text-xs bg-blue-500 text-white rounded px-1">今日</span>}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="px-3 py-2">
                    {dayEvents.length === 0 ? (
                      <span className="text-xs text-gray-400">試合なし</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {dayEvents.map(e => {
                          const hasBroadcast = !!e.broadcast_info
                          const color = sourceColor(e.source)
                          return (
                            <button
                              key={e.id}
                              onClick={() => setSelected(e)}
                              className="text-left w-full"
                            >
                              <span
                                style={{
                                  display: 'inline-block',
                                  backgroundColor: hasBroadcast ? color : 'transparent',
                                  color: hasBroadcast ? '#fff' : color,
                                  border: hasBroadcast ? 'none' : `1px solid ${color}`,
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.82em',
                                  lineHeight: '1.5',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {e.event_time && (
                                  <span style={{ opacity: 0.85, marginRight: '4px' }}>{e.event_time}</span>
                                )}
                                {e.title}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* FullCalendar for month and list views */}
      <div className={view === 'week' ? 'hidden' : ''}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={fcHeaderToolbar}
          buttonText={{ today: '今日' }}
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
      </div>

      {selected && (
        <EventDetailModal event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
