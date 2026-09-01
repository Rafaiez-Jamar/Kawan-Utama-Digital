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

-- Create policy to allow anyone to read users (for team members list)
CREATE POLICY "Allow anyone to read users" ON public.users
  FOR SELECT USING (true);

-- Create policy to allow anyone to create users (for team management)
CREATE POLICY "Allow anyone to create users" ON public.users
  FOR INSERT WITH CHECK (true);

-- Create policy to allow anyone to update users
CREATE POLICY "Allow anyone to update users" ON public.users
  FOR UPDATE USING (true);

-- Create policy to allow anyone to delete users
CREATE POLICY "Allow anyone to delete users" ON public.users
  FOR DELETE USING (true);
