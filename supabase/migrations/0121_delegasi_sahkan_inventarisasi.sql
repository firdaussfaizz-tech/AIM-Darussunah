-- 0121: Delegasi pengesahan Inventarisasi/Verifikasi lewat izin 'sahkan'.
--
-- Trigger pengesahan sebelumnya mengunci ke is_yayasan_admin(). Kini pengesahan
-- juga diizinkan bagi peran yang diberi izin 'sahkan' pada modul Inventarisasi
-- (srp_inventarisasi) via matriks — ADITIF (hak Yayasan tetap). Lapisan RLS
-- tabel aset/inventarisasi_persiapan tetap berlaku: pelaku juga harus punya
-- akses tulis ke unit terkait (umumnya manajer unit).

-- Verifikasi aset: tahap 'disahkan'/'ditolak' = Yayasan ATAU izin sahkan.
create or replace function public.aset_verif_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verif_status is distinct from old.verif_status then
    if new.verif_status in ('disahkan', 'ditolak')
       and not (public.is_yayasan_admin() or public.has_perm('srp_inventarisasi', 'sahkan')) then
      raise exception 'Hanya Yayasan atau peran berizin sahkan yang dapat mengesahkan/menolak verifikasi aset.' using errcode = 'P0001';
    end if;
    if new.verif_status = 'diverifikasi'
       and not (public.is_yayasan_admin() or public.is_school_manager(new.school_id)) then
      raise exception 'Verifikasi tingkat sekolah hanya oleh Kepala Sekolah/pengelola unit.' using errcode = 'P0001';
    end if;
    if new.verif_status = 'diajukan' then
      new.verif_diajukan_by := coalesce(new.verif_diajukan_by, public.current_employee_id());
      new.verif_diajukan_at := coalesce(new.verif_diajukan_at, now());
    elsif new.verif_status = 'diverifikasi' then
      new.verif_kepsek_by := public.current_employee_id();
      new.verif_kepsek_at := now();
    elsif new.verif_status in ('disahkan', 'ditolak') then
      new.verif_yayasan_by := public.current_employee_id();
      new.verif_yayasan_at := now();
    end if;
  end if;
  new.verified := (new.verif_status = 'disahkan');
  new.verified_at := case when new.verif_status = 'disahkan' then coalesce(new.verif_yayasan_at, now()) else null end;
  return new;
end $$;

-- Persiapan inventarisasi: pengesahan = Yayasan ATAU izin sahkan.
create or replace function public.inv_persiapan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.tim_disahkan is distinct from old.tim_disahkan then
    if new.tim_disahkan
       and not (public.is_yayasan_admin() or public.has_perm('srp_inventarisasi', 'sahkan')) then
      raise exception 'Pengesahan Persiapan hanya oleh Yayasan atau peran berizin sahkan.' using errcode = 'P0001';
    end if;
    new.disahkan_by := case when new.tim_disahkan then public.current_employee_id() else null end;
    new.disahkan_at := case when new.tim_disahkan then now() else null end;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
