-- =====================================================================
-- 0084 — Integrasi Pengadaan → Barang Habis Pakai (Persediaan)
--
-- Permintaan: daftar Barang Habis Pakai (BHP) terisi otomatis tanpa input
-- manual. Pilihan pengguna: (a) item pengadaan yang ditandai "barang habis
-- pakai" otomatis menambah stok BHP saat diterima (BAST), dan (b) item
-- tersebut TIDAK dibuat sebagai aset tetap di Buku Inventaris — hanya masuk
-- Persediaan. Catatan hasil pengadaannya tetap ada (status diterima).
--
-- Perubahan:
--   • dka_usulan_item.is_habis_pakai (boolean) — penanda item persediaan.
--   • dka_pengadaan_proses.bhp_id — tautan ke barang_habis_pakai bila item
--     persediaan sudah diterima.
--   • Fungsi penerimaan dicabangkan: item persediaan → cari/buat BHP + catat
--     transaksi 'masuk' (stok ter-update otomatis oleh trigger bhp_apply_stok)
--     + catat Belanja ke Buku Kas; item biasa → tetap ke Inventaris + SPA
--     (seperti 0083).
--
-- Idempoten & drift-safe.
-- =====================================================================

do $$
begin
  if to_regclass('public.dka_usulan_item') is not null then
    alter table public.dka_usulan_item add column if not exists is_habis_pakai boolean not null default false;
    comment on column public.dka_usulan_item.is_habis_pakai is
      'true = barang habis pakai (persediaan): saat diterima masuk stok BHP, bukan aset tetap.';

    -- Tautan opsional ke barang BHP yang SUDAH ada (agar tidak bergantung pada
    -- kecocokan nama). Bila diisi, stok masuk ke barang ini saat diterima.
    if to_regclass('public.barang_habis_pakai') is not null
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'dka_usulan_item' and column_name = 'bhp_id'
       ) then
      alter table public.dka_usulan_item add column bhp_id uuid;
      alter table public.dka_usulan_item
        add constraint dka_usulan_item_bhp_id_fkey
        foreign key (bhp_id) references public.barang_habis_pakai (id) on delete set null;
    end if;
  end if;

  if to_regclass('public.dka_pengadaan_proses') is not null and to_regclass('public.barang_habis_pakai') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'dka_pengadaan_proses' and column_name = 'bhp_id'
     ) then
    alter table public.dka_pengadaan_proses add column bhp_id uuid;
    alter table public.dka_pengadaan_proses
      add constraint dka_pengadaan_proses_bhp_id_fkey
      foreign key (bhp_id) references public.barang_habis_pakai (id) on delete set null;
  end if;
end $$;

-- --- Fungsi penerimaan: cabang persediaan (BHP) vs aset tetap (Inventaris) ---
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
  v_bhp_id uuid;
  v_jumlah numeric;
  v_harga_unit numeric;
  v_total numeric;
  v_tahun int;
  v_rkas_item uuid;
begin
  if new.status = 'diterima' and (old.status is distinct from 'diterima')
     and new.aset_id is null and new.bhp_id is null then
    select * into v_item from public.dka_usulan_item where id = new.usulan_item_id;
    select school_id into v_school_id from public.dka_usulan where id = v_item.usulan_id;

    v_jumlah := coalesce(nullif(new.jumlah_realisasi, 0), nullif(v_item.jumlah_pengajuan, 0), 1);
    v_harga_unit := coalesce(nullif(new.harga_realisasi, 0), nullif(v_item.harga_satuan, 0), 0);
    v_total := v_jumlah * v_harga_unit;
    v_tahun := extract(year from coalesce(new.ba_serah_terima_tanggal, current_date))::int;

    if coalesce(v_item.is_habis_pakai, false) and to_regclass('public.barang_habis_pakai') is not null then
      -- ===== Barang Habis Pakai (persediaan) → stok BHP, BUKAN aset tetap =====
      -- Prioritas: barang BHP yang dipilih di item (bhp_id) → lalu cocokkan
      -- nama → kalau belum ada, buat baru.
      v_bhp_id := null;
      if v_item.bhp_id is not null then
        select id into v_bhp_id from public.barang_habis_pakai
          where id = v_item.bhp_id and school_id = v_school_id;
      end if;
      if v_bhp_id is null then
        select id into v_bhp_id from public.barang_habis_pakai
          where school_id = v_school_id and lower(nama) = lower(v_item.nama_aset)
          order by created_at limit 1;
      end if;
      if v_bhp_id is null then
        insert into public.barang_habis_pakai (school_id, nama, satuan, stok, stok_min)
        values (v_school_id, v_item.nama_aset, coalesce(nullif(v_item.satuan, ''), 'pcs'), 0, 0)
        returning id into v_bhp_id;
      end if;

      -- Transaksi masuk (trigger bhp_apply_stok akan menambah stok otomatis).
      insert into public.bhp_transaksi (bhp_id, tanggal, jenis, jumlah, sumber_tujuan, keterangan)
      values (
        v_bhp_id, coalesce(new.ba_serah_terima_tanggal, current_date), 'masuk', v_jumlah,
        new.penyedia,
        'Pengadaan DKA'
          || case when coalesce(new.nomor_spk, '') <> '' then ' — SPK ' || new.nomor_spk else '' end
      );
      new.bhp_id := v_bhp_id;

      -- Keuangan: Belanja Barang/Persediaan.
      if v_total > 0 and to_regclass('public.buku_kas_transaksi') is not null then
        select id into v_rkas_item from public.rkas_belanja_item
          where dka_usulan_item_id = v_item.id order by created_at limit 1;
        insert into public.buku_kas_transaksi (
          school_id, tanggal, jenis, kategori, sumber_dana, uraian, nominal,
          sumber, referensi_tabel, referensi_id, rkas_belanja_item_id, dicatat_oleh
        ) values (
          v_school_id, coalesce(new.ba_serah_terima_tanggal, current_date), 'keluar',
          'Belanja Barang/Persediaan', v_item.sumber_anggaran,
          'Pengadaan (persediaan): ' || v_item.nama_aset || ' (' || v_jumlah || ' ' || coalesce(v_item.satuan, 'pcs') || ')'
            || case when coalesce(new.nomor_spk, '') <> '' then ' — SPK ' || new.nomor_spk else '' end,
          v_total, 'Pengadaan', 'dka_pengadaan_proses', new.id, v_rkas_item,
          public.current_employee_id()
        );
      end if;

    else
      -- ===== Aset tetap → Inventaris (disimpan) + SPA otomatis + Belanja =====
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
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
