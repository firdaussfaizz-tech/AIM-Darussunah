-- 0098: RPC agregat untuk dasbor — pindahkan agregasi dari browser ke server.
--
-- Sebelumnya Dashboard Kesiswaan, Dashboard Kepegawaian, dan Analitik menarik
-- RIBUAN baris (presensi/nilai) ke browser lalu menghitung di sisi klien. Pada
-- skala ratusan siswa × puluhan hari, ini lambat, boros payload, dan berisiko
-- terpotong diam-diam bila PostgREST membatasi jumlah baris. Fungsi di bawah
-- menghitung di database (GROUP BY / count distinct) dan hanya mengembalikan
-- hasil ringkas.
--
-- SECURITY INVOKER (default): fungsi berjalan sebagai peran pemanggil, sehingga
-- RLS tiap tabel TETAP berlaku — Admin Yayasan melihat semua unit, Kepala
-- Sekolah/Wali Kelas hanya lingkupnya, persis seperti query langsung.

-- Indeks penunjang rentang tanggal (agregasi harian). Idempoten.
create index if not exists presensi_siswa_tanggal_idx on public.presensi_siswa (tanggal);
create index if not exists attendance_tanggal_idx on public.attendance (tanggal);

-- Rekap presensi SISWA per (tanggal, status) pada rentang [d1, d2].
create or replace function public.rekap_presensi_siswa(d1 date, d2 date)
returns table (tanggal date, status text, jumlah bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select ps.tanggal, ps.status::text, count(*)::bigint
  from public.presensi_siswa ps
  where ps.tanggal between d1 and d2
  group by ps.tanggal, ps.status
$$;

-- Rekap presensi PEGAWAI per (tanggal, status) pada rentang [d1, d2].
create or replace function public.rekap_presensi_pegawai(d1 date, d2 date)
returns table (tanggal date, status text, jumlah bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select a.tanggal, a.status::text, count(*)::bigint
  from public.attendance a
  where a.tanggal between d1 and d2
  group by a.tanggal, a.status
$$;

-- Jumlah siswa DISTINCT yang sudah memiliki nilai pada satu TA + semester.
create or replace function public.jumlah_siswa_dinilai(p_ta uuid, p_semester text)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct ns.siswa_id)::bigint
  from public.nilai_siswa ns
  where ns.tahun_ajaran_id = p_ta and ns.semester = p_semester
$$;

grant execute on function public.rekap_presensi_siswa(date, date) to authenticated;
grant execute on function public.rekap_presensi_pegawai(date, date) to authenticated;
grant execute on function public.jumlah_siswa_dinilai(uuid, text) to authenticated;

notify pgrst, 'reload schema';
