import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: '認証エラー' }, { status: 401 })
  }

  const { errors } = await request.json()
  if (!errors || errors.length === 0) return NextResponse.json({ ok: true })

  // Gmail SMTP via Nodemailer (環境変数が設定されている場合のみ)
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD

  if (gmailUser && gmailPass) {
    try {
      const nodemailer = (await import('nodemailer')).default
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })
      await transporter.sendMail({
        from: gmailUser,
        to: 'boxingcafe2020@gmail.com',
        subject: "[Shinta's Boxing Calendar] スクレイピングエラー通知",
        text: [
          'スクレイピング中にエラーが発生しました。',
          '',
          ...errors,
          '',
          '管理画面でご確認ください:',
          `${process.env.NEXT_PUBLIC_SITE_URL}/admin/scrape`,
        ].join('\n'),
      })
    } catch {}
  }

  return NextResponse.json({ ok: true })
}
