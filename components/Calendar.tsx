'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { BoxingEvent } from '@/types'
import { useState } from 'react'
import EventDetailModal from './EventDetailModal'

interface Props {
  events: BoxingEvent[]
}

export default function Calendar({ events }: Props) {
  const [selected, setSelected] = useState<BoxingEvent | null>(null)

  const calendarEvents = events.map(e => {
    const color = sourceColor(e.source)
    const hasBroadcast = !!e.broadcast_info
    return {
      id: e.id,
      title: e.title,
      start: e.event_time ? `${e.event_date}T${e.event_time}` : e.event_date,
      allDay: !e.event_time,
      extendedProps: e,
      backgroundColor: hasBroadcast ? color : 'transparent',
      borderColor: hasBroadcast ? color : 'transparent',
      textColor: hasBroadcast ? '#ffffff' : color,
    }
  })

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />手動登録
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Boxmob
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />BoxingScene
        </span>
        <span className="flex items-center gap-1.5 text-gray-400">
          <span className="w-3 h-3 rounded-full border border-gray-400 inline-block" />配信情報なし（テキストのみ）
        </span>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth',
        }}
        buttonText={{
          today: '今日',
          month: '月',
          week: '週',
          day: '日',
          list: 'リスト',
        }}
        locale="ja"
        events={calendarEvents}
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
