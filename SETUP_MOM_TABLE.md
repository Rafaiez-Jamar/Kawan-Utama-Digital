# Setup MOM (Minutes of Meeting) Table

Buka Supabase SQL Editor dan jalankan SQL berikut:

```sql
-- Create MOM table
CREATE TABLE IF NOT EXISTS public.mom (
  id BIGSERIAL PRIMARY KEY,
  created_by_email TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  
  -- Meeting Details
  client_name TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  meeting_time TIME,
  
  -- Content
  summary TEXT,
  notes TEXT,
  action_items TEXT,
  pic_name TEXT,
  deadline DATE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP
);

-- Enable Row Level Security
ALTER TABLE public.mom ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Sales can create MOM" ON public.mom;
DROP POLICY IF EXISTS "Sales can view own MOM" ON public.mom;
DROP POLICY IF EXISTS "Published MOM visible to all" ON public.mom;
DROP POLICY IF EXISTS "Sales can update own MOM" ON public.mom;
DROP POLICY IF EXISTS "Super Admin full access" ON public.mom;

-- Policies for MOM table
-- Sales can create MOM
CREATE POLICY "Sales can create MOM" ON public.mom
  FOR INSERT WITH CHECK (true);

-- Sales can view their own MOM (draft or published)
CREATE POLICY "Sales can view own MOM" ON public.mom
  FOR SELECT USING (created_by_email = current_user_email OR status = 'PUBLISHED');

-- Sales can update their own DRAFT MOM
CREATE POLICY "Sales can update own MOM" ON public.mom
  FOR UPDATE USING (created_by_email = current_user_email AND status = 'DRAFT');

-- Everyone can view published MOM
CREATE POLICY "Published MOM visible to all" ON public.mom
  FOR SELECT USING (status = 'PUBLISHED');
```

Setelah SQL dijalankan, tabel MOM siap digunakan! ✅
