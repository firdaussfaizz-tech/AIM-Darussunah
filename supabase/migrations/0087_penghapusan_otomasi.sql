-- =====================================================================
-- 0087 — Penghapusan & Pemindahtanganan (BAB X & XI): otomasi lintas SOP
--
-- SOP: Usulan penghapusan → Yayasan meneliti → Surat Persetujuan + SK →
-- pelaksanaan (Penjualan: hasil disetor ke rekening Yayasan; Hibah: BAST).
--
-- Sudah ada (0044): saat usulan DISAHKAN, aset ditandai status 'dihapus'
-- sehingga otomatis keluar dari Buku Inventaris & Buku Induk Inventaris
-- (keduanya memfilter status='aktif').
--
-- Otomasi tambahan saat DISAHKAN — menutup keterkaitan aset di modul lain
-- agar data konsisten lintas SOP:
--   A. Status Penggunaan (KIR) aktif untuk aset tsb → otomatis DIKEMBALIKAN
--      (tanggal_kembali = tanggal pengesahan). Aset yang dihapus tidak boleh
--      lagi tercatat sedang digunakan.
--   B. Permintaan Penyaluran yang masih 'diminta' untuk aset tsb → otomatis
--      DITOLAK (tidak mungkin disalurkan karena sudah dihapus).
--   C. Bila cara = PENJUALAN → hasil penjualan otomatis dicatat sebagai
--      pemasukan di Buku Kas (Pendapatan Penjualan Aset), sejumlah total
--      nilai item. Hibah/Pemusnahan tidak menimbulkan arus kas.
--
-- Idempoten & drift-safe.
-- =====================================================================

create or replace function public.aset_penghapusan_terapkan()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
begin
  if new.status = 'disahkan' and old.status is distinct from 'disahkan' then

    -- (0) Tandai aset 'dihapus' (keluar dari Inventaris & Buku Induk).
    update public.aset set status = 'dihapus'
    where id in (
      select aset_id from public.aset_penghapusan_item
      where penghapusan_id = new.id and aset_id is not null
    );

    -- (A) Tutup Status Penggunaan (KIR) yang masih aktif.
    if to_regclass('public.aset_penggunaan') is not null then
      update public.aset_penggunaan
        set status = 'dikembalikan',
            tanggal_kembali = coalesce(tanggal_kembali, current_date),
            keterangan = coalesce(nullif(keterangan, ''), '') ||
              case when coalesce(keterangan, '') <> '' then ' — ' else '' end ||
              'Ditutup otomatis: aset dihapus'
      where status = 'aktif'
        and aset_id in (
          select aset_id from public.aset_penghapusan_item
          where penghapusan_id = new.id and aset_id is not null
        );
    end if;

    -- (B) Batalkan permintaan Penyaluran yang masih menunggu.
    if to_regclass('public.aset_penyaluran') is not null then
      update public.aset_penyaluran
        set status = 'ditolak',
            keterangan = coalesce(nullif(keterangan, ''), '') ||
              case when coalesce(keterangan, '') <> '' then ' — ' else '' end ||
              'Dibatalkan otomatis: aset dihapus'
      where status = 'diminta'
        and aset_id in (
          select aset_id from public.aset_penghapusan_item
          where penghapusan_id = new.id and aset_id is not null
        );
    end if;

    -- (C) Penjualan → pemasukan di Buku Kas (hasil penjualan aset).
    if coalesce(new.cara, '') ilike 'Penjualan%'
       and to_regclass('public.buku_kas_transaksi') is not null then

      select coalesce(sum(nilai), 0) into v_total
      from public.aset_penghapusan_item
      where penghapusan_id = new.id;

      if v_total > 0 and not exists (
        select 1 from public.buku_kas_transaksi
        where referensi_tabel = 'aset_penghapusan' and referensi_id = new.id
      ) then
        perform set_config('app.bypass_kas_guard', 'on', true);
        insert into public.buku_kas_transaksi (
          school_id, tanggal, jenis, kategori, uraian, nominal,
          sumber, referensi_tabel, referensi_id, dicatat_oleh
        ) values (
          new.school_id, current_date, 'masuk', 'Pendapatan Penjualan Aset',
          'Hasil penjualan aset — penghapusan'
            || case when coalesce(new.nomor_sk, '') <> '' then ' (SK ' || new.nomor_sk || ')'
                    when coalesce(new.judul, '') <> '' then ' (' || new.judul || ')' else '' end,
          v_total, 'Penghapusan', 'aset_penghapusan', new.id, public.current_employee_id()
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aset_penghapusan_terapkan_trg on public.aset_penghapusan;
create trigger aset_penghapusan_terapkan_trg
  after update on public.aset_penghapusan
  for each row execute function public.aset_penghapusan_terapkan();

notify pgrst, 'reload schema';
