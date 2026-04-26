export type EventSource = 'manual' | 'boxmob' | 'boxingscene' | 'ringmagazine'

export interface BoxingEvent {
  id: string
  title: string
  event_date: string
  event_time: string | null
  location: string | null
  broadcast_info: string | null
  match_details: string | null
  source: EventSource
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface ScrapeLog {
  id: string
  source: string
  status: 'success' | 'failed'
  message: string | null
  events_added: number
  created_at: string
}

export interface ScrapedEvent {
  title: string
  event_date: string
  event_time: string | null
  location: string | null
  broadcast_info: string | null
  match_details: string | null
  source: EventSource
  source_url: string | null
}
