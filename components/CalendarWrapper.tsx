'use client'

import dynamic from 'next/dynamic'
import { BoxingEvent } from '@/types'

const Calendar = dynamic(() => import('./Calendar'), { ssr: false })

interface Props {
  events: BoxingEvent[]
}

export default function CalendarWrapper({ events }: Props) {
  return <Calendar events={events} />
}
