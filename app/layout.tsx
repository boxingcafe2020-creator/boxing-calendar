import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Shinta's Boxing Calendar",
  description: 'Boxing schedule, Japan',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
