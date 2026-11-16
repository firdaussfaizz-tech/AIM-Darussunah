-- 0107: Hasil pemeliharaan yang masih RUSAK → otomatis jadi Laporan Kerusakan.
--
-- Bila catatan Logbook Pemeliharaan/Perbaikan berakhir dengan kondisi 'sesudah'
-- rusak ringan/berat (mis. pemeriksaan menemukan kerusakan, atau perbaikan
-- belum tuntas), sistem otomatis membuat Laporan Kerusakan & Permintaan
-- Perbaikan baru (status 'dilaporkan') agar masuk antrean verifikasi.
--
-- Catatan:
--   * Hanya dipicu oleh 'kondisi_sesudah' rusak — logbook dari opname (0086)
--     hanya mengisi 'kondisi_sebelum', jadi tidak ikut terpicu.
--   * Dedup: tidak membuat laporan baru bila aset masih punya laporan terbuka
--     (dilaporkan/diverifikasi), agar tidak menumpuk.

create or replace function public.pemeliharaan_hasil_butuh_perbaikan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kondisi_sesudah in ('rusak_ringan', 'rusak_berat')
     and not exists (
       select 1 from public.aset_kerusakan k
       where k.aset_id = new.aset_id and k.status in ('dilaporkan', 'diverifikasi')
     ) then
    insert into public.aset_kerusakan
      (aset_id, tanggal_lapor, pelapor, uraian_kerusakan, perkiraan_penyebab, usulan_perbaikan, tingkat, status)
    values (
      new.aset_id,
      coalesce(new.tanggal, current_date),
      'Otomatis dari hasil pemeliharaan',
      coalesce(nullif(btrim(new.tindak_lanjut), ''), nullif(btrim(new.uraian), ''), 'Masih memerlukan perbaikan setelah pemeliharaan/pemeriksaan'),
      coalesce(nullif(btrim(new.uraian), ''), 'Hasil pemeliharaan/pemeriksaan'),
      nullif(btrim(new.tindak_lanjut), ''),
      case when new.kondisi_sesudah = 'rusak_berat' then 'berat' else 'ringan' end,
      'dilaporkan'
    );
  end if;
  return new;
end $$;
drop trigger if exists pemeliharaan_hasil_butuh_perbaikan_trg on public.aset_pemeliharaan_log;
create trigger pemeliharaan_hasil_butuh_perbaikan_trg
  after insert on public.aset_pemeliharaan_log
  for each row execute function public.pemeliharaan_hasil_butuh_perbaikan();

notify pgrst, 'reload schema';
