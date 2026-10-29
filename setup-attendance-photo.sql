-- Run this once in Supabase SQL Editor so attendance records can retain the captured check-in photo.
ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS photo_data text;
