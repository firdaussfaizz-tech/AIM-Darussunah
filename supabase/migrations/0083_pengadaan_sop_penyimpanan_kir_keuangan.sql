-- =====================================================================
-- 0083 — Alur Penerimaan → Penyimpanan → Penyaluran sesuai SOP BAB V,
--        + KIR (Penggunaan) otomatis saat disalurkan,
--        + pencatatan Belanja ke Buku Kas (Keuangan) saat diterima.
--
-- SOP BAB V (sopSarpras.penyaluran):
--   Penerimaan  : pemeriksaan (BA) → serah terima (BAST) → Daftar Hasil
--                 Pengadaan.
--   Penyimpanan : aset diterima lalu DISIMPAN dulu (belum ditempatkan di
--                 ruangan) — menunggu penyaluran.
--   Penyaluran  : Surat Permintaan Aset (SPA) → Surat Perintah Penyaluran
--                 Aset (SPPA) → aset ditempatkan di ruangan tujuan.
--
-- Perubahan terhadap 0082 (yang langsung 'disalurkan'):
--   • Saat BAST (diterima): aset masuk Inventaris dengan ruangan_id NULL
--     (status "disimpan"), lalu dibuatkan SPA otomatis (status 'diminta',
--     nomor SPA otomatis) ke ruangan tujuan DKA — muncul di antrean
--     Penyaluran, belum menempati ruangan.
--   • KIR: saat SPPA (disalurkan), selain memindah lokasi aset, otomatis
--     dibuat Kartu Inventaris Ruangan / status penggunaan (aset_penggunaan).
--   • Keuangan: saat diterima, dicatat Belanja (buku_kas_transaksi 'keluar',
--     sumber 'Pengadaan') sebesar nilai realisasi total, tertaut ke item
--     RKAS bila ada.
--
-- Jumlah & nilai perolehan total tetap diperbaiki (lih. 0082).
-- Idempoten & drift-safe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fungsi terima → Inventaris (disimpan) + SPA otomatis + Belanja Kas
-- ---------------------------------------------------------------------
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
  v_total numeric;
  v_tahun int;
  v_rkas_item uuid;
begin
  if new.status = 'diterima' and (old.status is distinct from 'diterima') and new.aset_id is null then
    select * into v_item from public.dka_usulan_item where id = new.usulan_item_id;
    select school_id into v_school_id from public.dka_usulan where id = v_item.usulan_id;

    v_jumlah := coalesce(nullif(new.jumlah_realisasi, 0), nullif(v_item.jumlah_pengajuan, 0), 1);
    v_harga_unit := coalesce(nullif(new.harga_realisasi, 0), nullif(v_item.harga_satuan, 0), 0);
    v_total := v_jumlah * v_harga_unit;
    v_tahun := extract(year from coalesce(new.ba_serah_terima_tanggal, current_date))::int;

    -- Masuk Inventaris, TAPI belum ditempatkan (ruangan_id NULL = disimpan).
    insert into public.aset (
      school_id, ruangan_id, nama, merk_tipe, tahun_perolehan, tanggal_perolehan,
      jumlah, satuan, nilai_perolehan, sumber_dana, kondisi, status, keterangan, klasifikasi_id
    ) values (
      v_school_id, null, v_item.nama_aset, v_item.spesifikasi,
      v_tahun, coalesce(new.ba_serah_terima_tanggal, current_date),
      v_jumlah, v_item.satuan, v_total, v_item.sumber_anggaran,
      'baik', 'aktif',
      'Hasil pengadaan DKA'
        || case when coalesce(new.nomor_spk, '') <> '' then ' — SPK ' || new.nomor_spk else '' end
        || ' (disimpan, menunggu penyaluran)',
      v_item.klasifikasi_id
    ) returning id into v_aset_id;

    new.aset_id := v_aset_id;

    -- SPA otomatis (status 'diminta') ke ruangan tujuan DKA — antrean Penyaluran.
    insert into public.aset_penyaluran (
      aset_id, ruangan_tujuan_id, tujuan_lokasi, penerima, jumlah,
      tanggal_permintaan, nomor_spa, status, keterangan
    ) values (
      v_aset_id, v_item.ruangan_id,
      case when v_item.ruangan_id is null then v_item.lokasi else null end,
      v_item.penanggung_jawab, v_jumlah,
      coalesce(new.ba_serah_terima_tanggal, current_date),
      public.next_doc_number(v_school_id, 'SPA', v_tahun),
      'diminta',
      'Otomatis dari pengadaan DKA (BAST'
        || case when coalesce(new.nomor_ba_serah_terima, '') <> '' then ' ' || new.nomor_ba_serah_terima else '' end || ').'
    );

    -- Keuangan: catat Belanja ke Buku Kas (bila nilai > 0).
    if v_total > 0 and to_regclass('public.buku_kas_transaksi') is not null then
      select id into v_rkas_item from public.rkas_belanja_item
        where dka_usulan_item_id = v_item.id order by created_at limit 1;
      insert into public.buku_kas_transaksi (
        school_id, tanggal, jenis, kategori, sumber_dana, uraian, nominal,
        sumber, referensi_tabel, referensi_id, rkas_belanja_item_id, dicatat_oleh
      ) values (
        v_school_id, coalesce(new.ba_serah_terima_tanggal, current_date), 'keluar',
        'Belanja Modal (Sarpras)', v_item.sumber_anggaran,
        'Pengadaan: ' || v_item.nama_aset || ' (' || v_jumlah || ' ' || coalesce(v_item.satuan, 'unit') || ')'
          || case when coalesce(new.nomor_spk, '') <> '' then ' — SPK ' || new.nomor_spk else '' end,
        v_total, 'Pengadaan', 'dka_pengadaan_proses', new.id, v_rkas_item,
        public.current_employee_id()
      );
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Saat SPPA (disalurkan): pindah lokasi aset + buat KIR (penggunaan)
-- ---------------------------------------------------------------------
create or replace function public.aset_penyaluran_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disalurkan' and (tg_op = 'INSERT' or old.status is distinct from 'disalurkan') then
    if new.tanggal_penyaluran is null then new.tanggal_penyaluran := current_date; end if;
    if new.ruangan_tujuan_id is not null then
      update public.aset set ruangan_id = new.ruangan_tujuan_id where id = new.aset_id;
    end if;
    -- KIR / status penggunaan otomatis (bila belum ada yang aktif untuk aset ini).
    if to_regclass('public.aset_penggunaan') is not null
       and not exists (select 1 from public.aset_penggunaan p where p.aset_id = new.aset_id and p.status = 'aktif') then
      insert into public.aset_penggunaan (
        aset_id, pengguna_nama, tanggal_penetapan, nomor_ba, keterangan, status
      ) values (
        new.aset_id, new.penerima, coalesce(new.tanggal_penyaluran, current_date), new.nomor_sppa,
        'Otomatis dari penyaluran (SPPA'
          || case when coalesce(new.nomor_sppa, '') <> '' then ' ' || new.nomor_sppa else '' end || ').',
        'aktif'
      );
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Backfill data lama
-- ---------------------------------------------------------------------
-- 3a) Belanja Kas untuk pengadaan diterima yang belum tercatat.
do $$
begin
  if to_regclass('public.buku_kas_transaksi') is not null then
    insert into public.buku_kas_transaksi (
      school_id, tanggal, jenis, kategori, sumber_dana, uraian, nominal,
      sumber, referensi_tabel, referensi_id, rkas_belanja_item_id
    )
    select u.school_id, coalesce(pr.ba_serah_terima_tanggal, a.tanggal_perolehan, current_date), 'keluar',
           'Belanja Modal (Sarpras)', it.sumber_anggaran,
           'Pengadaan: ' || it.nama_aset || ' (' || a.jumlah || ' ' || coalesce(a.satuan, 'unit') || ')'
             || case when coalesce(pr.nomor_spk, '') <> '' then ' — SPK ' || pr.nomor_spk else '' end,
           a.nilai_perolehan, 'Pengadaan', 'dka_pengadaan_proses', pr.id,
           (select rbi.id from public.rkas_belanja_item rbi where rbi.dka_usulan_item_id = it.id order by rbi.created_at limit 1)
    from public.dka_pengadaan_proses pr
    join public.dka_usulan_item it on it.id = pr.usulan_item_id
    join public.dka_usulan u on u.id = it.usulan_id
    join public.aset a on a.id = pr.aset_id
    where pr.aset_id is not null and coalesce(a.nilai_perolehan, 0) > 0
      and not exists (
        select 1 from public.buku_kas_transaksi bk
        where bk.referensi_tabel = 'dka_pengadaan_proses' and bk.referensi_id = pr.id
      );
  end if;
end $$;

-- 3b) KIR untuk aset yang sudah disalurkan tapi belum punya penggunaan aktif.
do $$
begin
  if to_regclass('public.aset_penggunaan') is not null then
    insert into public.aset_penggunaan (aset_id, pengguna_nama, tanggal_penetapan, nomor_ba, keterangan, status)
    select ap.aset_id, ap.penerima, coalesce(ap.tanggal_penyaluran, current_date), ap.nomor_sppa,
           'Otomatis dari penyaluran (SPPA'
             || case when coalesce(ap.nomor_sppa, '') <> '' then ' ' || ap.nomor_sppa else '' end || ').',
           'aktif'
    from public.aset_penyaluran ap
    where ap.status = 'disalurkan'
      and not exists (select 1 from public.aset_penggunaan p where p.aset_id = ap.aset_id and p.status = 'aktif');
  end if;
end $$;

notify pgrst, 'reload schema';
