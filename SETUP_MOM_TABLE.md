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
DROP POLICY IF EXISTS "Users can view own draft or published MOM" ON public.mom;
DROP POLICY IF EXISTS "Everyone can view published MOM" ON public.mom;
DROP POLICY IF EXISTS "Sales can update own draft MOM" ON public.mom;
DROP POLICY IF EXISTS "Super Admin can update published MOM" ON public.mom;

-- Policies for MOM table

-- Anyone can create MOM (status defaults to DRAFT)
CREATE POLICY "Sales can create MOM" ON public.mom
  FOR INSERT WITH CHECK (true);

-- Users can view their own MOM (draft or published) OR published MOM by others
CREATE POLICY "Users can view own draft or published MOM" ON public.mom
  FOR SELECT USING (
    created_by_email = current_user_email OR status = 'PUBLISHED'
  );

-- Sales can update their own DRAFT MOM only
CREATE POLICY "Sales can update own draft MOM" ON public.mom
  FOR UPDATE USING (
    created_by_email = current_user_email AND status = 'DRAFT'
  );

-- Super Admin can update published MOM (but not DRAFT of others)
CREATE POLICY "Super Admin can update published MOM" ON public.mom
  FOR UPDATE USING (
    status = 'PUBLISHED' OR created_by_email = current_user_email
  );

-- Anyone can delete their own MOM
CREATE POLICY "Users can delete own MOM" ON public.mom
  FOR DELETE USING (created_by_email = current_user_email);
```

Setelah SQL dijalankan, tabel MOM siap digunakan! ✅

## MOM Draft System Penjelasan:

### **Auto-Save ke localStorage (seperti WhatsApp)**
- Saat user ketik, draft otomatis tersimpan di browser
- Persisten walaupun browser ditutup atau logout
- Data tidak hilang dan bisa dilanjutkan kapan saja

### **Tombol "Simpan Draft"**
- Simpan draft ke Supabase database
- Status tetap DRAFT
- **Hanya creator yang bisa lihat**, bahkan Super Admin tidak bisa
- Bisa diakses di perangkat lain setelah login

### **Tombol "Publikasikan MOM"**
- Ubah status dari DRAFT → PUBLISHED
- Baru bisa dilihat oleh:
  - Product: Published MOM terkait spesifikasi
  - Admin: Semua published MOM untuk audit
  - Super Admin: Semua published MOM dengan akses penuh

### **Privacy Rules**
- ❌ Super Admin TIDAK bisa lihat DRAFT orang lain
- ❌ Admin TIDAK bisa lihat DRAFT orang lain
- ✅ Only PUBLISHED MOM yang bisa dilihat orang lain

