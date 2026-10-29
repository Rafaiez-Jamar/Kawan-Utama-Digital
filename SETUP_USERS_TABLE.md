# Cara Setup Users Table di Supabase

> **Jangan gunakan `public.users` untuk user baru.** Panduan SQL lama memberi akses terbuka ke kolom password plaintext dan sudah tidak berlaku.

Aplikasi sekarang membuat akun melalui Supabase Auth dan menyimpan profilnya di `public.profiles`, menggunakan Edge Function `user-admin`. Terapkan migrasi dengan `supabase db push`, lalu deploy function tersebut; lihat [panduan migrasi Auth](./supabase/LEGACY_AUTH_MIGRATION.md).

`setup-users-table.sql` hanya disediakan untuk instalasi lama yang memang memiliki akun legacy yang perlu dimigrasikan. Tabel legacy dikunci dari `anon` dan `authenticated`; hanya Edge Function server-side yang boleh membacanya selama migrasi. Setelah seluruh akun berhasil dipindahkan, ikuti langkah finalisasi untuk menghapus kolom password legacy.
