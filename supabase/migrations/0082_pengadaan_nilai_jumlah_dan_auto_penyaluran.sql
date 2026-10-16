-- =====================================================================
-- 0082 — Perbaikan Pengadaan → Inventaris + Auto Penerimaan/Penyaluran
--
-- 1) BUG: saat BA Serah Terima (status 'diterima'), aset yang dibuat mengambil
--    nilai_perolehan = harga SATUAN (bukan total), dan jumlah bisa jatuh ke 1.
--    aset.nilai_perolehan bermakna TOTAL seluruh jumlah (lih. form Inventaris),
--    sehingga 20 unit × Rp350.000 harus tercatat Rp7.000.000 dengan jumlah 20.
--
-- 2) Auto-integrasi: pengadaan yang selesai (diterima) otomatis juga tercatat
--    di modul Penerimaan & Penyaluran (aset_penyaluran) — langsung 'disalurkan'
--    ke ruangan tujuan item, penerima = penanggung jawab item.
--
-- 3) Nomor Berita Acara Pemeriksaan & Serah Terima disimpan (kolom baru), agar
--    bisa tampil di kartu detail per item.
--
-- Termasuk backfill untuk data pengadaan yang sudah diterima sebelumnya.
-- Idempoten & drift-safe.
-- =====================================================================

-- --- Kolom nomor Berita Acara ---
do $$
begin
  if to_regclass('public.dka_pengadaan_proses') is not null then
    alter table public.dka_pengadaan_proses
      add column if not exists nomor_ba_pemeriksaan text,
      add column if not exists nomor_ba_serah_terima text;
  end if;
end $$;

-- --- Fungsi terima → Inventaris (jumlah & nilai total benar) + auto penyaluran ---
create or replace function public.dka_pengadaan_terima_ke_inventaris()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.dka_usulan_item%rowtype;
  v_school_id uuid;
  v_aset_id uuid;
  v_jumlah numeric;
  v_harga_unit numeric;
begin
  if new.status = 'diterima' and (old.status is distinct from 'diterima') and new.aset_id is null then
    select * into v_item from public.dka_usulan_item where id = new.usulan_item_id;
    select school_id into v_school_id from public.dka_usulan where id = v_item.usulan_id;

    -- Jumlah: realisasi bila ada (>0), jika tidak pakai pengajuan, minimal 1.
    v_jumlah := coalesce(nullif(new.jumlah_realisasi, 0), nullif(v_item.jumlah_pengajuan, 0), 1);
    -- Harga per unit (realisasi bila ada, jika tidak pakai harga satuan item).
    v_harga_unit := coalesce(nullif(new.harga_realisasi, 0), nullif(v_item.harga_satuan, 0), 0);

    insert into public.aset (
      school_id, ruangan_id, nama, merk_tipe, tahun_perolehan, tanggal_perolehan,
      jumlah, satuan, nilai_perolehan, sumber_dana, kondisi, status, keterangan, klasifikasi_id
    ) values (
      v_school_id, v_item.ruangan_id, v_item.nama_aset, v_item.spesifikasi,
      extract(year from coalesce(new.ba_serah_terima_tanggal, current_date))::int,
      coalesce(new.ba_serah_terima_tanggal, current_date),
      v_jumlah,
      v_item.satuan,
      v_jumlah * v_harga_unit,          -- NILAI TOTAL (bukan per unit)
      v_item.sumber_anggaran,
      'baik', 'aktif',
      'Hasil pengadaan DKA' || case when new.nomor_spk is not null and new.nomor_spk <> '' then ' — SPK ' || new.nomor_spk else '' end,
      v_item.klasifikasi_id
    ) returning id into v_aset_id;

    new.aset_id := v_aset_id;

    -- Auto-catat ke Penerimaan & Penyaluran (langsung disalurkan ke ruangan item).
    insert into public.aset_penyaluran (
      aset_id, ruangan_tujuan_id, tujuan_lokasi, penerima, jumlah,
      tanggal_permintaan, tanggal_penyaluran, status, keterangan
    ) values (
      v_aset_id, v_item.ruangan_id,
      case when v_item.ruangan_id is null then v_item.lokasi else null end,
      v_item.penanggung_jawab, v_jumlah,
      coalesce(new.ba_serah_terima_tanggal, current_date),
      coalesce(new.ba_serah_terima_tanggal, current_date),
      'disalurkan',
      'Otomatis dari pengadaan DKA (BA Serah Terima'
        || case when coalesce(new.nomor_ba_serah_terima, '') <> '' then ' ' || new.nomor_ba_serah_terima else '' end || ').'
    );
  end if;
  return new;
end;
$$;

-- --- Backfill 1: koreksi jumlah & nilai total aset hasil pengadaan terdahulu ---
do $$
begin
  if to_regclass('public.dka_pengadaan_proses') is not null and to_regclass('public.aset') is not null then
    update public.aset a
    set jumlah = sub.v_jumlah,
        nilai_perolehan = sub.v_jumlah * sub.v_harga
    from (
      select pr.aset_id,
             coalesce(nullif(pr.jumlah_realisasi, 0), nullif(it.jumlah_pengajuan, 0), 1) as v_jumlah,
             coalesce(nullif(pr.harga_realisasi, 0), nullif(it.harga_satuan, 0), 0) as v_harga
      from public.dka_pengadaan_proses pr
      join public.dka_usulan_item it on it.id = pr.usulan_item_id
      where pr.aset_id is not null
    ) sub
    where a.id = sub.aset_id;
  end if;
end $$;

-- --- Backfill 2: buat catatan Penyaluran untuk pengadaan diterima yang belum punya ---
do $$
begin
  if to_regclass('public.aset_penyaluran') is not null and to_regclass('public.dka_pengadaan_proses') is not null then
    insert into public.aset_penyaluran (
      aset_id, ruangan_tujuan_id, tujuan_lokasi, penerima, jumlah,
      tanggal_permintaan, tanggal_penyaluran, status, keterangan
    )
    select pr.aset_id, it.ruangan_id,
           case when it.ruangan_id is null then it.lokasi else null end,
           it.penanggung_jawab,
           coalesce(nullif(pr.jumlah_realisasi, 0), nullif(it.jumlah_pengajuan, 0), 1),
           coalesce(pr.ba_serah_terima_tanggal, current_date),
           coalesce(pr.ba_serah_terima_tanggal, current_date),
           'disalurkan',
           'Otomatis dari pengadaan DKA (BA Serah Terima).'
    from public.dka_pengadaan_proses pr
    join public.dka_usulan_item it on it.id = pr.usulan_item_id
    where pr.aset_id is not null
      and not exists (select 1 from public.aset_penyaluran ap where ap.aset_id = pr.aset_id);
  end if;
end $$;

notify pgrst, 'reload schema';
