-- =====================================================================
-- 0092 — AKADEMIK: SISTEM PEMBANGUN KURIKULUM ISLAM PLUS
--
-- Mengubah halaman referensi menjadi SISTEM penyusunan Kurikulum Islam
-- Plus (Sekolah Islam Plus Al-Hanif) berbasis kerangka/outline pada
-- SK Tim Penyusun Kurikulum Islam Plus No. 01.006/SK-YDC/IV/26 (Lampiran 2).
--
-- Alur kerja: Tim Penyusun menyusun isi tiap bagian outline sebagai
-- AJUAN → Admin Yayasan MENETAPKAN (acc) atau MENOLAK. Isi yang
-- ditetapkan menjadi kurikulum resmi; versi lama diarsipkan otomatis.
--
--   draft      : sedang disusun Tim Penyusun (belum diajukan)
--   diajukan   : diajukan ke Yayasan, menunggu keputusan
--   ditetapkan : disetujui Yayasan → kurikulum resmi berlaku
--   ditolak    : ditolak Yayasan (dengan catatan revisi)
--   diarsipkan : versi lama yang tergantikan penetapan baru
--
-- Akses: is_kurikulum_penyusun() = Admin Yayasan + manajemen unit
-- (Kepala Sekolah / Waka Kurikulum, dll). Penetapan/penolakan hanya
-- oleh Admin Yayasan (is_yayasan_admin).
--
-- Non-destruktif & idempoten.
-- =====================================================================

-- --- Helper: siapa anggota "Tim Penyusun Kurikulum" --------------------
create or replace function public.is_kurikulum_penyusun()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_yayasan_admin()
  or exists (
    select 1 from public.user_roles ur
    left join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (ur.role in ('admin_sekolah', 'kepala_sekolah')
           or r.tingkat_akses in ('manajer_unit', 'yayasan_penuh'))
  )
  or exists (
    select 1
    from public.employees e
    join public.positions p on p.id = e.position_id
    where e.user_id = auth.uid()
      and p.beri_akses_manajer
  );
$$;

-- --- Tabel entri kurikulum (konten per bagian + alur ajuan) -----------
create table if not exists public.kip_entri (
  id uuid primary key default gen_random_uuid(),
  bagian_kode text not null,              -- kunci bagian outline, mis. 'I.A', 'II', 'III.B'
  bagian_judul text not null,             -- label bagian (denormalisasi utk riwayat)
  konten text not null default '',        -- isi bagian (teks/markdown ringan)
  status text not null default 'draft'
    check (status in ('draft', 'diajukan', 'ditetapkan', 'ditolak', 'diarsipkan')),
  versi integer not null default 1,
  catatan_penyusun text,                  -- catatan Tim Penyusun saat mengajukan
  catatan_reviu text,                     -- catatan Yayasan saat menetapkan/menolak
  disusun_oleh uuid references public.employees(id) on delete set null,
  disusun_nama text,
  diajukan_at timestamptz,
  direviu_oleh uuid references public.employees(id) on delete set null,
  direviu_nama text,
  direviu_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hanya SATU entri aktif (draft / diajukan) per bagian pada satu waktu.
create unique index if not exists kip_entri_satu_aktif
  on public.kip_entri (bagian_kode)
  where status in ('draft', 'diajukan');

create index if not exists kip_entri_bagian_idx on public.kip_entri (bagian_kode);
create index if not exists kip_entri_status_idx on public.kip_entri (status);

drop trigger if exists trg_kip_entri_updated_at on public.kip_entri;
create trigger trg_kip_entri_updated_at
  before update on public.kip_entri
  for each row execute function public.set_updated_at();

-- --- Guard transisi status (siapa boleh pindah ke status apa) ---------
create or replace function public.kip_guard_transisi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Entri baru hanya boleh dibuat sebagai draft/diajukan oleh Penyusun.
    if new.status not in ('draft', 'diajukan') and not public.is_yayasan_admin() then
      raise exception 'Tim Penyusun hanya dapat membuat draft atau ajuan.';
    end if;
  elsif tg_op = 'UPDATE' then
    -- Menetapkan / menolak ajuan hanya oleh Admin Yayasan.
    if new.status is distinct from old.status
       and new.status in ('ditetapkan', 'ditolak')
       and not public.is_yayasan_admin() then
      raise exception 'Hanya Admin Yayasan yang dapat menetapkan atau menolak ajuan.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kip_guard_transisi on public.kip_entri;
create trigger trg_kip_guard_transisi
  before insert or update on public.kip_entri
  for each row execute function public.kip_guard_transisi();

-- --- Arsipkan versi lama saat ada penetapan baru ----------------------
create or replace function public.kip_arsip_versi_lama()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.kip_entri
     set status = 'diarsipkan', updated_at = now()
   where bagian_kode = new.bagian_kode
     and id <> new.id
     and status = 'ditetapkan';
  return new;
end;
$$;

drop trigger if exists trg_kip_arsip_versi_lama on public.kip_entri;
create trigger trg_kip_arsip_versi_lama
  after insert or update of status on public.kip_entri
  for each row when (new.status = 'ditetapkan')
  execute function public.kip_arsip_versi_lama();

-- --- RLS ---------------------------------------------------------------
alter table public.kip_entri enable row level security;

drop policy if exists kip_entri_select on public.kip_entri;
create policy kip_entri_select on public.kip_entri for select
  using (public.is_kurikulum_penyusun());

drop policy if exists kip_entri_insert on public.kip_entri;
create policy kip_entri_insert on public.kip_entri for insert
  with check (public.is_kurikulum_penyusun());

drop policy if exists kip_entri_update on public.kip_entri;
create policy kip_entri_update on public.kip_entri for update
  using (public.is_kurikulum_penyusun())
  with check (public.is_kurikulum_penyusun());

drop policy if exists kip_entri_delete on public.kip_entri;
create policy kip_entri_delete on public.kip_entri for delete
  using (public.is_yayasan_admin()
         or (public.is_kurikulum_penyusun() and status = 'draft'));

-- Muat ulang skema PostgREST.
notify pgrst, 'reload schema';
