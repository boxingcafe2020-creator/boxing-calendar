import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from './LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold hover:text-gray-300 transition">
              🥊 Shinta's Boxing Calendar
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="hover:text-white text-gray-300 transition">ダッシュボード</Link>
              <Link href="/admin/events" className="hover:text-white text-gray-300 transition">イベント管理</Link>
              <Link href="/admin/events/new" className="hover:text-white text-gray-300 transition">新規追加</Link>
              <Link href="/admin/scrape" className="hover:text-white text-gray-300 transition">スクレイピング</Link>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-6xl mx-auto py-8 px-6">
        {children}
      </main>
    </div>
  )
}
