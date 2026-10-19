-- =====================================================================
-- 0085 — Inventarisasi (BAB VII): penyelarasan SOP + otomasi tindak lanjut
--
-- SOP BAB VII: sensus/opname → rekonsiliasi kondisi (sudah ada) → Laporan
-- Hasil Inventarisasi & Berita Acara → TINDAK LANJUT aset rusak berat / hilang
-- (lewat Penghapusan).
--
-- Perubahan:
--   • aset_opname: nomor_ba (No. Berita Acara Hasil Inventarisasi),
--     tim (Tim Inventarisasi), penghapusan_id (tautan tindak lanjut).
--   • Saat opname SELESAI: otomatis dibuat usulan Penghapusan berstatus DRAFT
--     berisi aset yang HILANG (ditemukan=false) atau RUSAK BERAT
--     (kondisi_aktual='rusak_berat') — sebagai tindak lanjut, menautkan
--     inventarisasi ke alur Penghapusan (BAB X/XI). Tetap perlu diajukan &
--     disahkan Yayasan secara manual.
--
-- Rekonsiliasi kondisi_aktual → aset.kondisi sudah ada (0044) — otomatis
-- memperbarui Inventaris/KIA/KIR. Idempoten & drift-safe.
-- =====================================================================

do $$
begin
  if to_regclass('public.aset_opname') is not null then
    alter table public.aset_opname add column if not exists nomor_ba text;
    alter table public.aset_opname add column if not exists tim text;
    if to_regclass('public.aset_penghapusan') is not null
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'aset_opname' and column_name = 'penghapusan_id'
       ) then
      alter table public.aset_opname add column penghapusan_id uuid;
      alter table public.aset_opname
        add constraint aset_opname_penghapusan_id_fkey
        foreign key (penghapusan_id) references public.aset_penghapusan (id) on delete set null;
    end if;
  end if;
end $$;

-- Tindak lanjut otomatis saat opname selesai: buat draft Penghapusan untuk
-- aset hilang / rusak berat.
create or replace function public.aset_opname_tindak_lanjut()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hapus_id uuid;
  v_jml int;
begin
  if new.status = 'selesai' and (old.status is distinct from 'selesai')
     and new.penghapusan_id is null
     and to_regclass('public.aset_penghapusan') is not null then

    select count(*) into v_jml
    from public.aset_opname_item it
    where it.opname_id = new.id and it.aset_id is not null
      and (it.ditemukan = false or it.kondisi_aktual = 'rusak_berat');

    if v_jml > 0 then
      insert into public.aset_penghapusan (school_id, judul, alasan, cara, status)
      values (
        new.school_id,
        'Tindak Lanjut Inventarisasi' || case when coalesce(new.judul, '') <> '' then ' — ' || new.judul else '' end,
        'Rusak berat / Kehilangan (hasil inventarisasi)', 'Penghapusan', 'draft'
      ) returning id into v_hapus_id;

      insert into public.aset_penghapusan_item (penghapusan_id, aset_id, kode_aset, nama_aset, kondisi, nilai, keterangan)
      select v_hapus_id, it.aset_id, it.kode_aset, it.nama_aset,
             coalesce(it.kondisi_aktual, it.kondisi_tercatat),
             a.nilai_perolehan,
             case when it.ditemukan = false then 'Hilang (hasil inventarisasi)' else 'Rusak berat (hasil inventarisasi)' end
      from public.aset_opname_item it
      left join public.aset a on a.id = it.aset_id
      where it.opname_id = new.id and it.aset_id is not null
        and (it.ditemukan = false or it.kondisi_aktual = 'rusak_berat');

      new.penghapusan_id := v_hapus_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aset_opname_tindak_lanjut_trg on public.aset_opname;
create trigger aset_opname_tindak_lanjut_trg
  before update on public.aset_opname
  for each row execute function public.aset_opname_tindak_lanjut();

notify pgrst, 'reload schema';
