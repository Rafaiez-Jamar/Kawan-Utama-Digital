# Cara Setup Users Table di Supabase

## Step 1: Buka Supabase SQL Editor
1. Buka dashboard Supabase → Project anda
2. Klik menu "SQL Editor" di sebelah kiri
3. Klik "New Query"

## Step 2: Copy-Paste SQL berikut

```sql
-- Create users table for team members (shared across workspace)
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sales', 'product', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anyone to read users" ON public.users;
DROP POLICY IF EXISTS "Allow anyone to create users" ON public.users;
DROP POLICY IF EXISTS "Allow anyone to update users" ON public.users;
DROP POLICY IF EXISTS "Allow anyone to delete users" ON public.users;

-- Create policies to allow anyone to read/create/update/delete users
CREATE POLICY "Allow anyone to read users" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Allow anyone to create users" ON public.users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anyone to update users" ON public.users
  FOR UPDATE USING (true);

CREATE POLICY "Allow anyone to delete users" ON public.users
  FOR DELETE USING (true);
```

## Step 3: Jalankan Query
1. Klik tombol "Run" atau tekan `Ctrl+Enter`
2. Tunggu hingga query selesai
3. Seharusnya muncul pesan "success"

## Step 4: Verifikasi
- Buka menu "Table Editor" di Supabase
- Seharusnya ada table baru "users" dengan kolom:
  - id (Primary Key)
  - name
  - email (UNIQUE)
  - password
  - role (sales, product, admin)
  - created_at
  - updated_at

## Selesai! 🎉
Sekarang aplikasi bisa menyimpan dan menampilkan team members secara terpusat di Supabase.
