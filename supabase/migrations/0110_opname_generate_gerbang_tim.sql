-- 0110: Gerbang penarikan aset opname — Tim Inventarisasi harus disahkan dulu.
--
-- Redefinisi aset_opname_generate (dari 0044) dengan tambahan pemeriksaan:
-- penarikan aset (Pendataan) ditolak bila Tim Inventarisasi sesi tsb belum
-- disahkan Yayasan. Selaras dengan gerbang di UI (langkah 1 → 2).

create or replace function public.aset_opname_generate(p_opname_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_tim_disahkan boolean;
begin
  select school_id, tim_disahkan into v_school, v_tim_disahkan
  from public.aset_opname where id = p_opname_id and status = 'berjalan';
  if v_school is null then raise exception 'Sesi opname tidak ditemukan atau sudah selesai.' using errcode = 'P0001'; end if;
  if not (public.is_yayasan_admin() or public.is_school_manager(v_school)) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if not coalesce(v_tim_disahkan, false) then
    raise exception 'Pendataan belum dapat dimulai: Tim Inventarisasi belum disahkan Yayasan (Langkah 1 — Persiapan).' using errcode = 'P0001';
  end if;
  delete from public.aset_opname_item where opname_id = p_opname_id;
  insert into public.aset_opname_item (opname_id, aset_id, kode_aset, nama_aset, kondisi_tercatat)
  select p_opname_id, a.id, a.kode_aset, a.nama, a.kondisi
  from public.aset a
  where a.school_id = v_school and a.status = 'aktif'
  order by a.kode_aset nulls last, a.nama;
end;
$$;

notify pgrst, 'reload schema';
