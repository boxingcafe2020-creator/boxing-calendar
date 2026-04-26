-- イベントテーブル
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TEXT,
  location TEXT,
  broadcast_info TEXT,
  match_details TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'boxmob', 'boxingscene', 'ringmagazine')),
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- スクレイピングログテーブル
CREATE TABLE scrape_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  message TEXT,
  events_added INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 全ユーザーが読み取り可能（認証不要）
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "誰でも読み取り可能" ON events FOR SELECT USING (true);
CREATE POLICY "認証済みユーザーのみ書き込み可能" ON events FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証済みユーザーのみ" ON scrape_logs FOR ALL USING (auth.uid() IS NOT NULL);
