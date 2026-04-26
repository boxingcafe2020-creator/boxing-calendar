import EventForm from '@/components/EventForm'

export default function NewEventPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">新規イベント登録</h1>
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <EventForm />
      </div>
    </div>
  )
}
