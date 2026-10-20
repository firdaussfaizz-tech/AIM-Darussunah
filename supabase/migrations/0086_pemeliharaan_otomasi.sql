-- =====================================================================
-- 0086 — Pemeliharaan & Perbaikan (BAB IX): otomasi lintas SOP
--
-- Integrasi/otomasi:
--   A. Inventarisasi → Pemeliharaan: saat opname SELESAI, aset berkondisi
--      RUSAK RINGAN otomatis dibuatkan entri Logbook Pemeliharaan (jenis
--      Korektif, "perlu perbaikan") sebagai tindak lanjut — melengkapi
--      tindak lanjut hilang/rusak berat → Penghapusan (0085).
--   B. Pemeliharaan → Keuangan: biaya pada Logbook Pemeliharaan otomatis
--      tercatat sebagai Belanja Pemeliharaan di Buku Kas (sinkron saat
--      diubah/dihapus).
--
-- Sudah ada: kondisi_sesudah → perbarui kondisi aset (Inventaris/KIA/KIR, 0044);
-- ambil dari Rencana Pemeliharaan DKA (link dka_pemeliharaan_item_id).
-- Idempoten & drift-safe.
-- =====================================================================

-- --- A. Opname selesai: penghapusan (hilang/rusak berat) + pemeliharaan (rusak ringan) ---
create or replace function public.aset_opname_tindak_lanjut()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hapus_id uuid;
  v_jml int;
begin
  if new.status = 'selesai' and (old.status is distinct from 'selesai') then

    -- (1) Hilang / rusak berat → draft Penghapusan.
    if new.penghapusan_id is null and to_regclass('public.aset_penghapusan') is not null then
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

    -- (2) Rusak ringan → entri Logbook Pemeliharaan (perlu perbaikan).
    if to_regclass('public.aset_pemeliharaan_log') is not null then
      insert into public.aset_pemeliharaan_log (aset_id, tanggal, jenis, uraian, biaya, kondisi_sebelum, tindak_lanjut)
      select it.aset_id, coalesce(new.tanggal_selesai, current_date), 'Korektif',
             'Perlu perbaikan — temuan inventarisasi' || case when coalesce(new.judul, '') <> '' then ' (' || new.judul || ')' else '' end,
             0, 'rusak_ringan', 'Jadwalkan & laksanakan perbaikan'
      from public.aset_opname_item it
      where it.opname_id = new.id and it.aset_id is not null and it.kondisi_aktual = 'rusak_ringan'
        and not exists (
          select 1 from public.aset_pemeliharaan_log pl
          where pl.aset_id = it.aset_id and pl.kondisi_sebelum = 'rusak_ringan'
            and pl.tanggal = coalesce(new.tanggal_selesai, current_date)
            and pl.uraian like 'Perlu perbaikan — temuan inventarisasi%'
        );
    end if;
  end if;
  return new;
end;
$$;

-- --- B. Biaya Pemeliharaan → Buku Kas (Belanja Pemeliharaan) ---
create or replace function public.pemeliharaan_log_ke_kas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_nama text;
begin
  if to_regclass('public.buku_kas_transaksi') is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Lewati pagar transaksi otomatis saat sistem menyinkronkan.
  perform set_config('app.bypass_kas_guard', 'on', true);

  -- Hapus baris kas lama (untuk UPDATE/DELETE).
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.buku_kas_transaksi
    where referensi_tabel = 'aset_pemeliharaan_log' and referensi_id = old.id;
  end if;

  -- Buat baris kas baru bila ada biaya (INSERT/UPDATE).
  if tg_op in ('INSERT', 'UPDATE') and coalesce(new.biaya, 0) > 0 then
    select school_id, nama into v_school, v_nama from public.aset where id = new.aset_id;
    if v_school is not null then
      insert into public.buku_kas_transaksi (
        school_id, tanggal, jenis, kategori, uraian, nominal,
        sumber, referensi_tabel, referensi_id, dicatat_oleh
      ) values (
        v_school, coalesce(new.tanggal, current_date), 'keluar', 'Belanja Pemeliharaan',
        'Pemeliharaan/Perbaikan: ' || coalesce(nullif(new.uraian, ''), v_nama, 'aset')
          || case when coalesce(new.pelaksana, '') <> '' then ' — ' || new.pelaksana else '' end,
        new.biaya, 'Pemeliharaan', 'aset_pemeliharaan_log', new.id, public.current_employee_id()
      );
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists pemeliharaan_log_ke_kas_trg on public.aset_pemeliharaan_log;
create trigger pemeliharaan_log_ke_kas_trg
  after insert or update or delete on public.aset_pemeliharaan_log
  for each row execute function public.pemeliharaan_log_ke_kas();

-- Backfill: catat biaya pemeliharaan terdahulu yang belum ada di Buku Kas.
do $$
begin
  if to_regclass('public.buku_kas_transaksi') is not null then
    perform set_config('app.bypass_kas_guard', 'on', true);
    insert into public.buku_kas_transaksi (
      school_id, tanggal, jenis, kategori, uraian, nominal,
      sumber, referensi_tabel, referensi_id
    )
    select a.school_id, coalesce(pl.tanggal, current_date), 'keluar', 'Belanja Pemeliharaan',
           'Pemeliharaan/Perbaikan: ' || coalesce(nullif(pl.uraian, ''), a.nama, 'aset'),
           pl.biaya, 'Pemeliharaan', 'aset_pemeliharaan_log', pl.id
    from public.aset_pemeliharaan_log pl
    join public.aset a on a.id = pl.aset_id
    where coalesce(pl.biaya, 0) > 0
      and not exists (
        select 1 from public.buku_kas_transaksi bk
        where bk.referensi_tabel = 'aset_pemeliharaan_log' and bk.referensi_id = pl.id
      );
  end if;
end $$;

notify pgrst, 'reload schema';
