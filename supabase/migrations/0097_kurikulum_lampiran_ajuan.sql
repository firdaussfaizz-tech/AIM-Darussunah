-- =====================================================================
-- 0097 — KURIKULUM LAMPIRAN: status AJUAN (harus di-acc Yayasan)
--
-- Dokumen yang diunggah ke sebuah bagian bersifat PENGAJUAN kepada
-- Yayasan: diunggah = 'diajukan', lalu Admin Yayasan MENETAPKAN (acc)
-- atau MENOLAK. Penetapan/penolakan hanya oleh Admin Yayasan (trigger).
--
-- Non-destruktif & idempoten.
-- =====================================================================

do $$
begin
  if to_regclass('public.kurikulum_lampiran') is not null then
    alter table public.kurikulum_lampiran
      add column if not exists status text not null default 'diajukan'
        check (status in ('diajukan', 'ditetapkan', 'ditolak'));
    alter table public.kurikulum_lampiran add column if not exists catatan_reviu text;
    alter table public.kurikulum_lampiran add column if not exists direviu_oleh uuid references public.employees(id) on delete set null;
    alter table public.kurikulum_lampiran add column if not exists direviu_nama text;
    alter table public.kurikulum_lampiran add column if not exists direviu_at timestamptz;
  end if;
end $$;

-- Hanya Admin Yayasan yang boleh menetapkan/menolak.
create or replace function public.kurikulum_lampiran_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('ditetapkan', 'ditolak')
     and not public.is_yayasan_admin() then
    raise exception 'Hanya Admin Yayasan yang dapat menetapkan atau menolak lampiran.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kurikulum_lampiran_guard on public.kurikulum_lampiran;
create trigger trg_kurikulum_lampiran_guard
  before insert or update on public.kurikulum_lampiran
  for each row execute function public.kurikulum_lampiran_guard();

-- Izinkan UPDATE (untuk acc/tolak) oleh Yayasan atau manajemen unit;
-- transisi status tetap dibatasi trigger di atas.
drop policy if exists kurikulum_lampiran_update on public.kurikulum_lampiran;
create policy kurikulum_lampiran_update on public.kurikulum_lampiran for update
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

notify pgrst, 'reload schema';
