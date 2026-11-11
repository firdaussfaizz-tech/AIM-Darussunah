-- 0101: kolom deskripsi (dokumentasi/cara hitung) untuk indikator & aspek KPI.
-- Dipakai Master KPI untuk mencatat penjelasan/format perhitungan tiap indikator.

alter table public.kpi2_indikator add column if not exists deskripsi text;
alter table public.kpi2_aspek add column if not exists deskripsi text;

notify pgrst, 'reload schema';
