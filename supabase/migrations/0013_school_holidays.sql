-- Kalender hari libur (di luar libur mingguan hari Minggu), dipakai untuk
-- mengecualikan tanggal tersebut dari perhitungan Hari Kerja Wajib pada
-- Indeks Kehadiran (remunerasi.js: hitungIH / hitungHariKerjaWajibDefault).
-- school_id NULL = berlaku untuk seluruh yayasan (libur nasional); diisi =
-- khusus satu sekolah (mis. libur kegiatan sekolah tertentu).
-- Non-destruktif: tabel baru, tidak mengubah tabel yang ada.

create table if not exists public.school_holidays (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  keterangan text not null,
  school_id uuid references public.schools(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tanggal, school_id)
);

alter table public.school_holidays enable row level security;

-- Semua pengguna login boleh membaca (dipakai dalam perhitungan IH untuk
-- pegawai mana pun), sama seperti pola leave_types_select.
drop policy if exists school_holidays_select on public.school_holidays;
create policy school_holidays_select on public.school_holidays for select using (auth.uid() is not null);

-- Admin Yayasan/HR bisa kelola hari libur yayasan (school_id null) & semua
-- sekolah; Kepala Sekolah/Admin Sekolah hanya bisa kelola hari libur untuk
-- sekolah yang menjadi wewenangnya (school_id wajib diisi untuk kasus ini,
-- karena has_school_access(null) hanya true untuk admin_yayasan/hr).
drop policy if exists school_holidays_write on public.school_holidays;
create policy school_holidays_write on public.school_holidays for all using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
) with check (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);

-- Seed HANYA hari libur nasional bertanggal tetap (bukan libur berbasis
-- kalender Hijriah/lunar yang bisa berubah tiap tahun dan berisiko salah
-- bila ditebak) — admin menambahkan sisanya (Idul Fitri, Idul Adha, Tahun
-- Baru Islam, Maulid Nabi, Isra Miraj, Nyepi, Waisak, Wafat/Kenaikan Isa
-- Almasih, libur semester, dll.) secara manual lewat halaman Kalender Libur.
insert into public.school_holidays (tanggal, keterangan, school_id)
select v.tanggal, v.keterangan, null
from (values
  (date (extract(year from now())::text || '-01-01'), 'Tahun Baru Masehi'),
  (date (extract(year from now())::text || '-08-17'), 'Hari Kemerdekaan RI'),
  (date (extract(year from now())::text || '-12-25'), 'Hari Raya Natal'),
  (date ((extract(year from now())::int + 1)::text || '-01-01'), 'Tahun Baru Masehi')
) as v(tanggal, keterangan)
on conflict (tanggal, school_id) do nothing;
