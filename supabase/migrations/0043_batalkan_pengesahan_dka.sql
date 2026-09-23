-- =====================================================================
-- BATALKAN PENGESAHAN DKA (koreksi / uji coba).
--
-- Status 'disahkan' sengaja dikunci sebagai keputusan final, tapi Yayasan
-- perlu jalan untuk MEMBATALKAN pengesahan (mis. salah sah, atau uji coba)
-- agar prosedur perencanaan mengulang dari awal:
--   * DKA dikembalikan ke status 'draft' (paling awal) → jejak keputusan
--     Yayasan (diputuskan_by/at, catatan) dibersihkan.
--   * Progres pengadaan yang OTOMATIS ter-seed saat pengesahan (0042)
--     dihapus, sehingga tidak ada sisa proses pengadaan menggantung.
--
-- Dijalankan lewat RPC SECURITY DEFINER agar ATOMIK (hapus progres + reset
-- status tidak bisa setengah jalan) dan otorisasi terpusat: HANYA Yayasan
-- (Admin Yayasan/HR). Aman dijalankan ulang (create or replace).
--
-- JALANKAN SETELAH 0042.
-- =====================================================================

create or replace function public.dka_batalkan_pengesahan(p_usulan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_yayasan_admin() then
    raise exception 'Hanya Yayasan yang dapat membatalkan pengesahan DKA.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.dka_usulan where id = p_usulan_id and status = 'disahkan') then
    raise exception 'DKA tidak ditemukan atau statusnya bukan disahkan.' using errcode = 'P0001';
  end if;

  -- Bersihkan progres pengadaan yang ter-seed saat pengesahan → mulai dari awal.
  delete from public.dka_pengadaan_proses p
  using public.dka_usulan_item it
  where p.usulan_item_id = it.id and it.usulan_id = p_usulan_id;

  -- Kembalikan DKA ke draft & hapus jejak keputusan Yayasan.
  update public.dka_usulan
  set status = 'draft',
      diputuskan_by = null,
      diputuskan_by_user_id = null,
      diputuskan_at = null,
      catatan_yayasan = null
  where id = p_usulan_id;
end;
$$;

comment on function public.dka_batalkan_pengesahan(uuid) is
  'Membatalkan pengesahan DKA: hapus progres pengadaan ter-seed + kembalikan status ke draft (prosedur mengulang dari awal). Hanya Yayasan.';
