-- =====================================================================
-- 0090 — KESISWAAN: KERINGANAN BIAYA SISWA (potongan/beasiswa) untuk
-- SPP & Uang Pangkal, dengan kebijakan per-musim (tahun ajaran).
--
-- Dua lapis:
--   1. Kebijakan Keringanan (per tahun ajaran) — berlaku OTOMATIS saat
--      generate tagihan. Kriteria: semua / anak pegawai / anak ke-N+.
--      Sasaran SPP atau Uang Pangkal (komponen tertentu / seluruh),
--      bentuk persen / nominal, dengan jendela tanggal berlaku (musiman)
--      + syarat & ketentuan (teks).
--   2. Keringanan per Siswa — pemberian manual/khusus (beasiswa kasus).
--
-- Penerapan dihitung saat GENERATE (frontend) dan disimpan pada tagihan
-- sebagai nominal_bruto → potongan → nominal_tagihan (bersih), plus
-- catatan. Untuk Uang Pangkal, potongan dicatat sebagai baris item negatif
-- agar rincian transparan. Tagihan lama tidak berubah.
--
-- Non-destruktif & idempoten.
-- =====================================================================

-- 1. Tautan siswa → pegawai (orang tua), untuk kriteria "anak pegawai".
alter table public.siswa
  add column if not exists employee_ortu_id uuid references public.employees(id) on delete set null;
comment on column public.siswa.employee_ortu_id is
  'Orang tua siswa yang berstatus pegawai (opsional) — dasar potongan "anak pegawai".';

-- 2. Kolom potongan pada tagihan (bruto → potongan → bersih).
alter table public.spp_tagihan
  add column if not exists nominal_bruto numeric(14,2),
  add column if not exists potongan numeric(14,2) not null default 0,
  add column if not exists potongan_catatan text;

alter table public.up_tagihan
  add column if not exists nominal_bruto numeric(14,2),
  add column if not exists potongan numeric(14,2) not null default 0,
  add column if not exists potongan_catatan text;

-- Izinkan baris item Uang Pangkal bernilai negatif (untuk baris potongan).
alter table public.up_tagihan_item drop constraint if exists up_tagihan_item_nominal_check;
alter table public.up_tarif_item drop constraint if exists up_tarif_item_nominal_check;

-- 3. Kebijakan Keringanan (per tahun ajaran).
create table if not exists public.keringanan_kebijakan (
  id uuid primary key default gen_random_uuid(),
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade, -- null = semua unit
  program text check (program in ('fullday', 'boarding')),       -- null = semua program
  nama text not null,
  sasaran text not null check (sasaran in ('spp', 'uang_pangkal')),
  komponen text,                 -- Uang Pangkal: komponen tertentu; null = seluruh
  tipe text not null check (tipe in ('persen', 'nominal')),
  nilai numeric(14,2) not null default 0 check (nilai >= 0),
  kriteria text not null default 'semua' check (kriteria in ('semua', 'anak_pegawai', 'anak_ke_min')),
  anak_ke_min int,               -- untuk kriteria 'anak_ke_min'
  berlaku_mulai date,
  berlaku_sampai date,
  syarat text,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists keringanan_kebijakan_ta_idx on public.keringanan_kebijakan (tahun_ajaran_id);

drop trigger if exists trg_keringanan_kebijakan_updated_at on public.keringanan_kebijakan;
create trigger trg_keringanan_kebijakan_updated_at
  before update on public.keringanan_kebijakan
  for each row execute function public.set_updated_at();

-- 4. Keringanan per Siswa (pemberian manual).
create table if not exists public.keringanan_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  sasaran text not null check (sasaran in ('spp', 'uang_pangkal')),
  komponen text,
  tipe text not null check (tipe in ('persen', 'nominal')),
  nilai numeric(14,2) not null default 0 check (nilai >= 0),
  alasan text,
  aktif boolean not null default true,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists keringanan_siswa_siswa_idx on public.keringanan_siswa (siswa_id);
create index if not exists keringanan_siswa_ta_idx on public.keringanan_siswa (tahun_ajaran_id);

-- 5. RLS.
alter table public.keringanan_kebijakan enable row level security;
alter table public.keringanan_siswa enable row level security;

drop policy if exists keringanan_kebijakan_select on public.keringanan_kebijakan;
create policy keringanan_kebijakan_select on public.keringanan_kebijakan for select using (auth.uid() is not null);
drop policy if exists keringanan_kebijakan_write on public.keringanan_kebijakan;
create policy keringanan_kebijakan_write on public.keringanan_kebijakan for all
  using (public.is_yayasan_admin() or (school_id is not null and public.is_school_manager(school_id)))
  with check (public.is_yayasan_admin() or (school_id is not null and public.is_school_manager(school_id)));

drop policy if exists keringanan_siswa_select on public.keringanan_siswa;
create policy keringanan_siswa_select on public.keringanan_siswa for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id))
);
drop policy if exists keringanan_siswa_write on public.keringanan_siswa;
create policy keringanan_siswa_write on public.keringanan_siswa for all
  using (public.is_yayasan_admin() or public.is_school_manager(public.siswa_school_id(siswa_id)))
  with check (public.is_yayasan_admin() or public.is_school_manager(public.siswa_school_id(siswa_id)));

notify pgrst, 'reload schema';
