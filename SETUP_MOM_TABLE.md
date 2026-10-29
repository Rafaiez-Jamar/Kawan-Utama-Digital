# Setup MOM (Minutes of Meeting)

Tabel MOM, struktur absensi, dan Row Level Security dibuat oleh migrasi Supabase. Untuk setup baru atau memperbarui project yang sudah ada:

1. Hubungkan Supabase CLI ke project.
2. Jalankan `supabase db push`.
3. Pastikan semua migrasi selesai di Supabase Dashboard → Database → Migrations.

Jangan gunakan SQL policy manual lama yang pernah ada di dokumen ini. Policy lama membolehkan semua user melihat atau membuat data; migrasi aplikasi sekarang menerapkan akses berdasarkan role dan pemilik data.

## Penyimpanan draft dan publikasi

- Draft otomatis disimpan di localStorage browser agar perubahan yang belum tersinkron tetap ada di perangkat itu.
- Tombol **Simpan Draft** menyimpan draft ke Supabase supaya bisa dilanjutkan lintas perangkat.
- Tombol **Publikasikan MOM** menyimpan status `PUBLISHED` agar laporan dapat dilihat role yang diizinkan.
- Jika Supabase gagal, aplikasi menampilkan error dan tidak menyatakan operasi database berhasil.
