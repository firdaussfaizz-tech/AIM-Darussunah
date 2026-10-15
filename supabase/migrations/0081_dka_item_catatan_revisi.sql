-- =====================================================================
-- 0081 — Catatan Revisi per Item DKA
--
-- Menambah kolom `catatan_revisi` pada item usulan DKA (pengadaan &
-- pemeliharaan) agar Yayasan dapat memberi catatan perbaikan PER ITEM saat
-- menelaah usulan (status 'diajukan') — melengkapi catatan tingkat-usulan
-- (dka_usulan.catatan_yayasan) yang sudah ada.
--
-- RLS tidak diubah: policy dka_usulan_item_write (0037) sudah mengizinkan
-- Yayasan (is_yayasan_admin) menulis kapan pun, termasuk saat 'diajukan';
-- unit hanya menulis saat draft/dikembalikan. Pola sama untuk item
-- pemeliharaan.
--
-- Idempoten & drift-safe (to_regclass + add column if not exists).
-- =====================================================================

do $$
begin
  if to_regclass('public.dka_usulan_item') is not null then
    alter table public.dka_usulan_item add column if not exists catatan_revisi text;
    comment on column public.dka_usulan_item.catatan_revisi is
      'Catatan perbaikan per item dari Yayasan saat menelaah usulan DKA.';
  end if;

  if to_regclass('public.dka_pemeliharaan_item') is not null then
    alter table public.dka_pemeliharaan_item add column if not exists catatan_revisi text;
    comment on column public.dka_pemeliharaan_item.catatan_revisi is
      'Catatan perbaikan per item pemeliharaan dari Yayasan saat menelaah usulan DKA.';
  end if;
end $$;

notify pgrst, 'reload schema';
