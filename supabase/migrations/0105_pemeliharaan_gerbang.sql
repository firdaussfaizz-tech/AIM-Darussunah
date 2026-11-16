-- 0105: GERBANG pelaksanaan pemeliharaan (analog gerbang pemesanan pengadaan).
--
-- Aturan: catatan pelaksanaan (Logbook) yang MERUJUK item DKA pemeliharaan
-- hanya boleh dibuat bila Program & Jadwal untuk item itu sudah berstatus
-- 'dijadwalkan' (atau sudah 'dilaksanakan'). Sebelum dijadwalkan, pelaksanaan
-- ditolak. Logbook ad-hoc (tanpa rujukan DKA) tidak terpengaruh gerbang ini.

create or replace function public.pemeliharaan_gate_pelaksanaan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.pemeliharaan_status_enum;
begin
  if new.dka_pemeliharaan_item_id is not null then
    select status into v_status from public.dka_pemeliharaan_proses
      where pemeliharaan_item_id = new.dka_pemeliharaan_item_id;
    -- Item DKA tanpa baris program (kasus tepi) → tidak ada gerbang.
    if v_status is not null and v_status not in ('dijadwalkan', 'dilaksanakan') then
      raise exception 'Pelaksanaan belum dapat dicatat: Program Pemeliharaan untuk item ini belum dijadwalkan.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pemeliharaan_gate_pelaksanaan_trg on public.aset_pemeliharaan_log;
create trigger pemeliharaan_gate_pelaksanaan_trg
  before insert on public.aset_pemeliharaan_log
  for each row execute function public.pemeliharaan_gate_pelaksanaan();

notify pgrst, 'reload schema';
