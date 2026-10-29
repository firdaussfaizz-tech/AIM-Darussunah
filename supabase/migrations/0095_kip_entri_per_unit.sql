-- =====================================================================
-- 0095 — KURIKULUM ISLAM PLUS: penyusunan PER UNIT/JENJANG
--
-- Isi Kurikulum Islam Plus berbeda tiap jenjang (SD/SMP/SMA/Boarding),
-- maka penyusunannya dipisah per satuan: tiap unit punya dokumen lengkap
-- (seluruh bagian outline) sendiri. Admin Yayasan dapat mengisi &
-- merevisi seluruh unit; manajemen unit mengisi unitnya sendiri.
--
-- Perubahan: tambah kolom school_id; satu entri aktif per (unit, bagian);
-- arsip versi lama di-scope per (unit, bagian); RLS per-unit (mirip KSP).
--
-- Catatan: entri lama (school_id NULL, sebelum migrasi) tidak lagi tampil
-- di layar yang kini selalu memilih unit — perlu disusun ulang per unit.
--
-- Non-destruktif & idempoten.
-- =====================================================================

do $$
begin
  if to_regclass('public.kip_entri') is not null then
    alter table public.kip_entri
      add column if not exists school_id uuid references public.schools(id) on delete cascade;
    create index if not exists kip_entri_school_idx on public.kip_entri (school_id);
  end if;
end $$;

-- Satu entri aktif (draft/diajukan) per (unit, bagian).
drop index if exists kip_entri_satu_aktif;
create unique index if not exists kip_entri_satu_aktif_unit
  on public.kip_entri (school_id, bagian_kode)
  where status in ('draft', 'diajukan');

-- Arsipkan versi ditetapkan lama di unit & bagian yang sama saja.
create or replace function public.kip_arsip_versi_lama()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.kip_entri
     set status = 'diarsipkan', updated_at = now()
   where bagian_kode = new.bagian_kode
     and school_id is not distinct from new.school_id
     and id <> new.id
     and status = 'ditetapkan';
  return new;
end;
$$;

-- RLS per-unit: Yayasan (semua unit) + manajemen unit (unitnya sendiri).
drop policy if exists kip_entri_select on public.kip_entri;
create policy kip_entri_select on public.kip_entri for select
  using (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists kip_entri_insert on public.kip_entri;
create policy kip_entri_insert on public.kip_entri for insert
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists kip_entri_update on public.kip_entri;
create policy kip_entri_update on public.kip_entri for update
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists kip_entri_delete on public.kip_entri;
create policy kip_entri_delete on public.kip_entri for delete
  using (public.is_yayasan_admin()
         or (public.is_school_manager(school_id) and status = 'draft'));

notify pgrst, 'reload schema';
