import { createClient } from '@/lib/supabase/server'
import EventForm from '@/components/EventForm'
import { notFound } from 'next/navigation'

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('*').eq('id', id).single()
  if (!event) notFound()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">イベント編集</h1>
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <EventForm event={event} />
      </div>
    </div>
  )
}
