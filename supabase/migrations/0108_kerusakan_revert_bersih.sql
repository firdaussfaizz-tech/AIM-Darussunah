-- 0108: Bersihkan Laporan Kerusakan OTOMATIS saat sumbernya dibatalkan.
--
-- Konteks: Logbook dengan hasil 'sesudah' rusak otomatis membuat Laporan
-- Kerusakan (0107). Bila program pemeliharaan dikembalikan dari 'dilaksanakan'
-- ke status lain (revert), atau entri Logbook sumbernya dihapus, laporan
-- OTOMATIS yang MASIH TERBUKA ('dilaporkan') ikut dihapus agar tidak nyangkut.
-- Laporan yang sudah diverifikasi/ditolak/selesai TIDAK diutak-atik (menjaga
-- jejak kerja). Laporan manual (tanpa sumber Logbook) juga tidak terpengaruh.

-- Tautan ke Logbook sumber (untuk auto-report).
alter table public.aset_kerusakan
  add column if not exists sumber_log_id uuid references public.aset_pemeliharaan_log(id) on delete set null;

-- Redefinisi pemicu 0107 agar menyimpan tautan ke Logbook sumber.
create or replace function public.pemeliharaan_hasil_butuh_perbaikan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kondisi_sesudah in ('rusak_ringan', 'rusak_berat')
     and not exists (
       select 1 from public.aset_kerusakan k
       where k.aset_id = new.aset_id and k.status in ('dilaporkan', 'diverifikasi')
     ) then
    insert into public.aset_kerusakan
      (aset_id, tanggal_lapor, pelapor, uraian_kerusakan, perkiraan_penyebab, usulan_perbaikan, tingkat, status, sumber_log_id)
    values (
      new.aset_id,
      coalesce(new.tanggal, current_date),
      'Otomatis dari hasil pemeliharaan',
      coalesce(nullif(btrim(new.tindak_lanjut), ''), nullif(btrim(new.uraian), ''), 'Masih memerlukan perbaikan setelah pemeliharaan/pemeriksaan'),
      coalesce(nullif(btrim(new.uraian), ''), 'Hasil pemeliharaan/pemeriksaan'),
      nullif(btrim(new.tindak_lanjut), ''),
      case when new.kondisi_sesudah = 'rusak_berat' then 'berat' else 'ringan' end,
      'dilaporkan',
      new.id
    );
  end if;
  return new;
end $$;

-- Revert program pemeliharaan (dilaksanakan → lainnya) → hapus auto-report
-- terbuka untuk item itu.
create or replace function public.pemeliharaan_proses_revert_bersihkan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'dilaksanakan' and new.status is distinct from 'dilaksanakan' then
    delete from public.aset_kerusakan k
    using public.aset_pemeliharaan_log l
    where k.sumber_log_id = l.id
      and l.dka_pemeliharaan_item_id = new.pemeliharaan_item_id
      and k.status = 'dilaporkan';
  end if;
  return new;
end $$;
drop trigger if exists pemeliharaan_proses_revert_trg on public.dka_pemeliharaan_proses;
create trigger pemeliharaan_proses_revert_trg
  after update on public.dka_pemeliharaan_proses
  for each row execute function public.pemeliharaan_proses_revert_bersihkan();

-- Hapus entri Logbook → hapus auto-report terbuka yang berasal darinya.
create or replace function public.pemeliharaan_log_hapus_bersihkan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.aset_kerusakan
  where sumber_log_id = old.id and status = 'dilaporkan';
  return old;
end $$;
drop trigger if exists pemeliharaan_log_hapus_bersihkan_trg on public.aset_pemeliharaan_log;
create trigger pemeliharaan_log_hapus_bersihkan_trg
  before delete on public.aset_pemeliharaan_log
  for each row execute function public.pemeliharaan_log_hapus_bersihkan();

notify pgrst, 'reload schema';
