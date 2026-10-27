-- =====================================================================
-- 0091 — AKADEMIK: PANTAU PROGRES per CP/KKTP
--
-- Tiap Capaian Pembelajaran (CP) / KKTP (kurikulum_kkm) dapat dipantau
-- progres ketercapaiannya per siswa, dengan granularitas MINGGUAN,
-- BULANAN, dan SEMESTER. Satu entri per (CP, siswa, jenis, periode).
--
-- Akses: Admin Yayasan/Sekolah (unit ybs) & Wali Kelas (rombel yang
-- diampunya) — memakai helper RLS yang sudah ada.
--
-- Non-destruktif & idempoten.
-- =====================================================================

create table if not exists public.capaian_progres (
  id uuid primary key default gen_random_uuid(),
  kurikulum_kkm_id uuid not null references public.kurikulum_kkm(id) on delete cascade,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  jenis text not null check (jenis in ('mingguan', 'bulanan', 'semester')),
  periode text not null,                 -- label periode: 'Minggu ke-1', 'September', 'Ganjil', dst.
  tanggal date,
  status text not null default 'berproses' check (status in ('belum', 'berproses', 'tercapai')),
  skor numeric(5,2) check (skor is null or (skor >= 0 and skor <= 100)),
  catatan text,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kurikulum_kkm_id, siswa_id, jenis, periode)
);
create index if not exists capaian_progres_cp_idx on public.capaian_progres (kurikulum_kkm_id);
create index if not exists capaian_progres_siswa_idx on public.capaian_progres (siswa_id);
create index if not exists capaian_progres_rombel_idx on public.capaian_progres (rombel_id);

drop trigger if exists trg_capaian_progres_updated_at on public.capaian_progres;
create trigger trg_capaian_progres_updated_at
  before update on public.capaian_progres
  for each row execute function public.set_updated_at();

alter table public.capaian_progres enable row level security;

drop policy if exists capaian_progres_select on public.capaian_progres;
create policy capaian_progres_select on public.capaian_progres for select using (
  public.is_yayasan_admin()
  or public.has_school_access(public.rombel_school_id(rombel_id))
  or public.is_wali_kelas_of(rombel_id)
);
drop policy if exists capaian_progres_write on public.capaian_progres;
create policy capaian_progres_write on public.capaian_progres for all
  using (
    public.is_yayasan_admin()
    or public.has_school_access(public.rombel_school_id(rombel_id))
    or public.is_wali_kelas_of(rombel_id)
  )
  with check (
    public.is_yayasan_admin()
    or public.has_school_access(public.rombel_school_id(rombel_id))
    or public.is_wali_kelas_of(rombel_id)
  );

notify pgrst, 'reload schema';
