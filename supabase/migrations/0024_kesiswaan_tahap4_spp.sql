-- =====================================================================
-- MODUL KESISWAAN — TAHAP 4: SPP (tarif, tagihan bulanan, pembayaran)
-- + akses khusus role Bendahara.
--
-- Keputusan scoping awal: "SPP sekalian dari awal" + "Perlu role Bendahara
-- terpisah" (role 'bendahara' & fungsi is_bendahara() sudah dibuat di
-- migrasi 0021/0022). Berbeda dari tabel Kesiswaan lain yang RLS-nya
-- terbuka untuk has_school_access() secara umum, tabel SPP di sini SENGAJA
-- TIDAK dibuka untuk Wali Kelas (guru) — hanya Admin Yayasan/HR, Bendahara
-- (lintas unit), dan Admin Sekolah/Kepala Sekolah (unit sendiri), sesuai
-- keputusan bahwa akses keuangan siswa perlu dibatasi lebih ketat.
--
-- Non-destruktif: hanya menambah tabel, tipe, fungsi & trigger baru.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TARIF SPP — per unit sekolah + tahun ajaran, opsional spesifik per
--    tingkat (tingkat NULL = berlaku untuk semua tingkat di unit tsb,
--    dipakai sebagai fallback saat generate tagihan).
-- ---------------------------------------------------------------------
create table public.spp_tarif (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  tingkat text, -- null = berlaku semua tingkat di unit ini
  nominal numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hanya boleh ada SATU tarif "umum" (tingkat null) per unit+tahun ajaran —
-- pola sama dengan tahun_ajaran_satu_aktif_idx. Untuk tarif spesifik per
-- tingkat, unique constraint biasa sudah cukup (tingkat tidak pernah null).
create unique index spp_tarif_umum_idx on public.spp_tarif (school_id, tahun_ajaran_id) where tingkat is null;
create unique index spp_tarif_per_tingkat_idx on public.spp_tarif (school_id, tahun_ajaran_id, tingkat) where tingkat is not null;

create trigger trg_spp_tarif_updated_at
  before update on public.spp_tarif
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. TAGIHAN SPP — satu baris per siswa per bulan. status dihitung
--    otomatis lewat trigger di bawah setiap kali spp_pembayaran berubah,
--    JANGAN diubah manual dari aplikasi.
-- ---------------------------------------------------------------------
create type spp_tagihan_status_enum as enum ('belum_bayar', 'sebagian', 'lunas');

create table public.spp_tagihan (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  bulan int not null check (bulan between 1 and 12),
  tahun int not null,
  nominal_tagihan numeric(14,2) not null default 0,
  status spp_tagihan_status_enum not null default 'belum_bayar',
  jatuh_tempo date,
  created_at timestamptz not null default now(),
  unique (siswa_id, bulan, tahun)
);

create index spp_tagihan_siswa_id_idx on public.spp_tagihan (siswa_id);
create index spp_tagihan_periode_idx on public.spp_tagihan (tahun_ajaran_id, tahun, bulan);

-- ---------------------------------------------------------------------
-- 3. PEMBAYARAN SPP — satu tagihan bisa dicicil lewat beberapa baris
--    pembayaran (mis. dibayar 2x). Status tagihan dihitung ulang otomatis
--    dari total pembayaran lewat trigger fn_recompute_spp_tagihan_status.
-- ---------------------------------------------------------------------
create table public.spp_pembayaran (
  id uuid primary key default gen_random_uuid(),
  tagihan_id uuid not null references public.spp_tagihan(id) on delete cascade,
  nominal_dibayar numeric(14,2) not null check (nominal_dibayar > 0),
  tanggal_bayar date not null default current_date,
  metode text, -- 'Tunai' | 'Transfer Bank' | 'Lainnya' (bebas teks, tidak di-enum-kan)
  catatan text,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index spp_pembayaran_tagihan_id_idx on public.spp_pembayaran (tagihan_id);

-- ---------------------------------------------------------------------
-- 4. FUNGSI BANTUAN RLS
-- ---------------------------------------------------------------------
create function public.spp_tagihan_school_id(target_tagihan_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select public.siswa_school_id(siswa_id) from public.spp_tagihan where id = target_tagihan_id;
$$;

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.spp_tarif enable row level security;
alter table public.spp_tagihan enable row level security;
alter table public.spp_pembayaran enable row level security;

create policy spp_tarif_select on public.spp_tarif for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id)
);
create policy spp_tarif_write on public.spp_tarif for all
  using (public.is_yayasan_admin() or public.has_school_access(school_id))
  with check (public.is_yayasan_admin() or public.has_school_access(school_id));

create policy spp_tagihan_select on public.spp_tagihan for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id))
);
create policy spp_tagihan_write on public.spp_tagihan for all
  using (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
  with check (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)));

create policy spp_pembayaran_select on public.spp_pembayaran for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id))
);
create policy spp_pembayaran_write on public.spp_pembayaran for all
  using (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)))
  with check (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)));

-- ---------------------------------------------------------------------
-- 6. Hitung ulang status tagihan setiap kali pembayaran ditambah/dihapus.
-- ---------------------------------------------------------------------
create or replace function public.fn_recompute_spp_tagihan_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tagihan_id uuid;
  v_total_bayar numeric;
  v_nominal numeric;
  v_status spp_tagihan_status_enum;
begin
  v_tagihan_id := coalesce(new.tagihan_id, old.tagihan_id);
  select coalesce(sum(nominal_dibayar), 0) into v_total_bayar from public.spp_pembayaran where tagihan_id = v_tagihan_id;
  select nominal_tagihan into v_nominal from public.spp_tagihan where id = v_tagihan_id;

  v_status := case
    when v_total_bayar <= 0 then 'belum_bayar'
    when v_total_bayar >= coalesce(v_nominal, 0) then 'lunas'
    else 'sebagian'
  end;

  update public.spp_tagihan set status = v_status where id = v_tagihan_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_spp_pembayaran_recompute_ins on public.spp_pembayaran;
create trigger trg_spp_pembayaran_recompute_ins
  after insert on public.spp_pembayaran
  for each row execute function public.fn_recompute_spp_tagihan_status();

drop trigger if exists trg_spp_pembayaran_recompute_del on public.spp_pembayaran;
create trigger trg_spp_pembayaran_recompute_del
  after delete on public.spp_pembayaran
  for each row execute function public.fn_recompute_spp_tagihan_status();

-- ---------------------------------------------------------------------
-- 7. Notifikasi email ke orang tua saat tagihan LUNAS. Notifikasi saat
--    tagihan BARU DIBUAT sengaja TIDAK dipasang di sini — "Generate
--    Tagihan Bulanan" bisa membuat ratusan baris sekaligus, dan mengirim
--    ratusan email dalam satu proses berisiko kena rate-limit Brevo.
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_spp_lunas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nama text;
  v_nama_bulan text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
begin
  if new.status is distinct from old.status and new.status = 'lunas' then
    select nama_lengkap, email_ortu into v_nama, v_email from public.siswa where id = new.siswa_id;
    if v_email is null or v_email = '' then
      return new;
    end if;
    perform public.fn_send_email(
      v_email,
      format('Konfirmasi Pembayaran SPP — %s %s', v_nama_bulan[new.bulan], new.tahun),
      format('<p>Pembayaran SPP atas nama <b>%s</b> untuk periode <b>%s %s</b> sebesar %s telah LUNAS.</p><p>Terima kasih.</p>',
        coalesce(v_nama, '-'), v_nama_bulan[new.bulan], new.tahun, to_char(new.nominal_tagihan, 'FM999G999G999'))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_spp_lunas on public.spp_tagihan;
create trigger trg_notify_spp_lunas
  after update of status on public.spp_tagihan
  for each row execute function public.fn_notify_spp_lunas();
