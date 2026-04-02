-- ═══════════════════════════════════════════════════════════════════
--  Personal OS  –  Supabase SQL Setup
--  Run this entire file in Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  disabled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Notes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  title text,
  content text,
  created_at timestamp default now()
);

-- ─── 3. Activity ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('note','summarize','research')),
  data        JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notes_user     ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created  ON public.notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user  ON public.activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_type  ON public.activity(type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity(created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

-- profiles: users read/update own row; admins read all
CREATE POLICY "profiles_self_read"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_read"  ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- notes: users manage their own notes only
CREATE POLICY "notes_crud_own" ON public.notes FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- activity: users manage their own activity; admins read all
CREATE POLICY "activity_own"  ON public.activity FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activity_admin_read" ON public.activity FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── Function: auto-create profile on sign-up ─────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    CASE WHEN user_count = 0 THEN 'admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on new auth user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
