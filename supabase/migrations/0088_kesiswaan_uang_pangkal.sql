-- =====================================================================
-- 0088 — KESISWAAN: Program siswa (Fullday/Boarding) + UANG PANGKAL
--
-- Permintaan:
--   • Hitung, lacak, pantau, dan tagih UANG PANGKAL siswa (sekali saat
--     masuk), berbeda dari SPP bulanan.
--   • Komponen Fullday: SPP (bulan pertama), Gedung, Pendidikan, Buku,
--     Seragam. Boarding: + Sarana.
--   • Komponen "SPP (bulan pertama)" = daftar ulang: agar TIDAK dobel,
--     bulan pertama tidak lagi ditagih di SPP bulanan (ditandai di tagihan
--     uang pangkal: spp_termasuk + spp_bulan/spp_tahun; generator SPP
--     melewati periode tsb).
--
-- Pola mengikuti modul SPP (0024): tarif → tagihan → pembayaran (boleh
-- dicicil), status dihitung otomatis oleh trigger. Pembayaran uang pangkal
-- otomatis tercatat sebagai pemasukan di Buku Kas (kategori/sumber
-- 'Uang Pangkal'). Akses: Admin Yayasan, Bendahara (lintas unit), dan
-- manajemen unit sendiri — sama seperti SPP.
--
-- Non-destruktif & idempoten.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Atribut PROGRAM pada siswa (Fullday / Boarding).
-- ---------------------------------------------------------------------
alter table public.siswa
  add column if not exists program text not null default 'fullday'
  check (program in ('fullday', 'boarding'));
comment on column public.siswa.program is
  'Program layanan siswa: fullday (reguler) / boarding (pesantren). Menentukan komponen uang pangkal.';

-- ---------------------------------------------------------------------
-- 2. TARIF UANG PANGKAL — per unit + tahun ajaran + program, dengan
--    rincian komponen (header + item).
-- ---------------------------------------------------------------------
create table if not exists public.up_tarif (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  program text not null check (program in ('fullday', 'boarding')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, tahun_ajaran_id, program)
);

create table if not exists public.up_tarif_item (
  id uuid primary key default gen_random_uuid(),
  tarif_id uuid not null references public.up_tarif(id) on delete cascade,
  komponen text not null,
  nominal numeric(14,2) not null default 0 check (nominal >= 0),
  urutan int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists up_tarif_item_tarif_idx on public.up_tarif_item (tarif_id);

drop trigger if exists trg_up_tarif_updated_at on public.up_tarif;
create trigger trg_up_tarif_updated_at
  before update on public.up_tarif
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. TAGIHAN UANG PANGKAL — satu per siswa per tahun ajaran (sekali saat
--    masuk). Status dihitung otomatis dari pembayaran (jangan diubah
--    manual). Snapshot rincian komponen disimpan di up_tagihan_item.
-- ---------------------------------------------------------------------
create table if not exists public.up_tagihan (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  program text not null check (program in ('fullday', 'boarding')),
  nominal_tagihan numeric(14,2) not null default 0,
  status public.spp_tagihan_status_enum not null default 'belum_bayar',
  jatuh_tempo date,
  spp_termasuk boolean not null default false, -- true = memuat SPP bulan pertama
  spp_bulan int check (spp_bulan is null or spp_bulan between 1 and 12),
  spp_tahun int,
  keterangan text,
  created_at timestamptz not null default now(),
  unique (siswa_id, tahun_ajaran_id)
);
create index if not exists up_tagihan_siswa_idx on public.up_tagihan (siswa_id);
create index if not exists up_tagihan_ta_idx on public.up_tagihan (tahun_ajaran_id);

create table if not exists public.up_tagihan_item (
  id uuid primary key default gen_random_uuid(),
  tagihan_id uuid not null references public.up_tagihan(id) on delete cascade,
  komponen text not null,
  nominal numeric(14,2) not null default 0 check (nominal >= 0),
  urutan int not null default 0
);
create index if not exists up_tagihan_item_tagihan_idx on public.up_tagihan_item (tagihan_id);

-- ---------------------------------------------------------------------
-- 4. PEMBAYARAN UANG PANGKAL — boleh dicicil beberapa kali.
-- ---------------------------------------------------------------------
create table if not exists public.up_pembayaran (
  id uuid primary key default gen_random_uuid(),
  tagihan_id uuid not null references public.up_tagihan(id) on delete cascade,
  nominal_dibayar numeric(14,2) not null check (nominal_dibayar > 0),
  tanggal_bayar date not null default current_date,
  metode text,
  catatan text,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists up_pembayaran_tagihan_idx on public.up_pembayaran (tagihan_id);

-- ---------------------------------------------------------------------
-- 5. Hitung ulang status tagihan saat pembayaran berubah.
-- ---------------------------------------------------------------------
create or replace function public.fn_recompute_up_tagihan_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tagihan_id uuid;
  v_total numeric;
  v_nominal numeric;
  v_status public.spp_tagihan_status_enum;
begin
  v_tagihan_id := coalesce(new.tagihan_id, old.tagihan_id);
  select coalesce(sum(nominal_dibayar), 0) into v_total from public.up_pembayaran where tagihan_id = v_tagihan_id;
  select nominal_tagihan into v_nominal from public.up_tagihan where id = v_tagihan_id;
  v_status := case
    when v_total <= 0 then 'belum_bayar'
    when v_total >= coalesce(v_nominal, 0) then 'lunas'
    else 'sebagian'
  end;
  update public.up_tagihan set status = v_status where id = v_tagihan_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_up_pembayaran_recompute_ins on public.up_pembayaran;
create trigger trg_up_pembayaran_recompute_ins
  after insert on public.up_pembayaran
  for each row execute function public.fn_recompute_up_tagihan_status();
drop trigger if exists trg_up_pembayaran_recompute_del on public.up_pembayaran;
create trigger trg_up_pembayaran_recompute_del
  after delete on public.up_pembayaran
  for each row execute function public.fn_recompute_up_tagihan_status();

-- ---------------------------------------------------------------------
-- 6. Pembayaran Uang Pangkal → Buku Kas (pemasukan). Sinkron saat
--    ditambah/dihapus. Melewati pagar transaksi otomatis saat menyisipkan.
-- ---------------------------------------------------------------------
create or replace function public.fn_up_pembayaran_ke_kas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_nama text;
begin
  if to_regclass('public.buku_kas_transaksi') is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  perform set_config('app.bypass_kas_guard', 'on', true);

  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.buku_kas_transaksi
    where referensi_tabel = 'up_pembayaran' and referensi_id = old.id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and coalesce(new.nominal_dibayar, 0) > 0 then
    select s.school_id, s.nama_lengkap into v_school, v_nama
    from public.up_tagihan t join public.siswa s on s.id = t.siswa_id
    where t.id = new.tagihan_id;
    if v_school is not null then
      insert into public.buku_kas_transaksi (
        school_id, tanggal, jenis, kategori, uraian, nominal,
        sumber, referensi_tabel, referensi_id, dicatat_oleh
      ) values (
        v_school, coalesce(new.tanggal_bayar, current_date), 'masuk', 'Uang Pangkal',
        'Pembayaran Uang Pangkal: ' || coalesce(v_nama, 'siswa')
          || case when coalesce(new.metode, '') <> '' then ' — ' || new.metode else '' end,
        new.nominal_dibayar, 'Uang Pangkal', 'up_pembayaran', new.id, new.dicatat_oleh
      );
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_up_pembayaran_ke_kas on public.up_pembayaran;
create trigger trg_up_pembayaran_ke_kas
  after insert or update or delete on public.up_pembayaran
  for each row execute function public.fn_up_pembayaran_ke_kas();

-- ---------------------------------------------------------------------
-- 7. Helper RLS + kebijakan (pola sama dengan SPP 0024).
-- ---------------------------------------------------------------------
create or replace function public.up_tagihan_school_id(target_tagihan_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select public.siswa_school_id(siswa_id) from public.up_tagihan where id = target_tagihan_id;
$$;

create or replace function public.up_tarif_school_id(target_tarif_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select school_id from public.up_tarif where id = target_tarif_id;
$$;

alter table public.up_tarif enable row level security;
alter table public.up_tarif_item enable row level security;
alter table public.up_tagihan enable row level security;
alter table public.up_tagihan_item enable row level security;
alter table public.up_pembayaran enable row level security;

drop policy if exists up_tarif_select on public.up_tarif;
create policy up_tarif_select on public.up_tarif for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id)
);
drop policy if exists up_tarif_write on public.up_tarif;
create policy up_tarif_write on public.up_tarif for all
  using (public.is_yayasan_admin() or public.has_school_access(school_id))
  with check (public.is_yayasan_admin() or public.has_school_access(school_id));

drop policy if exists up_tarif_item_select on public.up_tarif_item;
create policy up_tarif_item_select on public.up_tarif_item for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tarif_school_id(tarif_id))
);
drop policy if exists up_tarif_item_write on public.up_tarif_item;
create policy up_tarif_item_write on public.up_tarif_item for all
  using (public.is_yayasan_admin() or public.has_school_access(public.up_tarif_school_id(tarif_id)))
  with check (public.is_yayasan_admin() or public.has_school_access(public.up_tarif_school_id(tarif_id)));

drop policy if exists up_tagihan_select on public.up_tagihan;
create policy up_tagihan_select on public.up_tagihan for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id))
);
drop policy if exists up_tagihan_write on public.up_tagihan;
create policy up_tagihan_write on public.up_tagihan for all
  using (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
  with check (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)));

drop policy if exists up_tagihan_item_select on public.up_tagihan_item;
create policy up_tagihan_item_select on public.up_tagihan_item for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tagihan_school_id(tagihan_id))
);
drop policy if exists up_tagihan_item_write on public.up_tagihan_item;
create policy up_tagihan_item_write on public.up_tagihan_item for all
  using (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tagihan_school_id(tagihan_id)))
  with check (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tagihan_school_id(tagihan_id)));

drop policy if exists up_pembayaran_select on public.up_pembayaran;
create policy up_pembayaran_select on public.up_pembayaran for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tagihan_school_id(tagihan_id))
);
drop policy if exists up_pembayaran_write on public.up_pembayaran;
create policy up_pembayaran_write on public.up_pembayaran for all
  using (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tagihan_school_id(tagihan_id)))
  with check (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.up_tagihan_school_id(tagihan_id)));

notify pgrst, 'reload schema';
