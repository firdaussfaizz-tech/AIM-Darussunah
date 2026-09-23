-- =====================================================================
-- PENYEMPURNAAN SARPRAS: PENOMORAN SURAT OTOMATIS + BARANG HABIS PAKAI.
--
-- 1) Penomoran otomatis dokumen (SPK/SK/BA/SPA/SPPA, dll) — nomor berurut
--    per unit + jenis + tahun, dibuat lewat RPC next_doc_number().
-- 2) Barang Habis Pakai (BHP) — master + buku transaksi masuk/keluar
--    (Buku Persediaan & Buku Pengeluaran), stok diperbarui OTOMATIS lewat
--    trigger. Melengkapi penatausahaan barang pakai habis (SOP BAB V).
--
-- Aman dijalankan ulang (idempoten). JALANKAN SETELAH 0044.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Penomoran surat otomatis.
-- ---------------------------------------------------------------------
create table if not exists public.doc_counter (
  school_id uuid not null references public.schools(id) on delete cascade,
  kode text not null,
  tahun int not null,
  last_no int not null default 0,
  primary key (school_id, kode, tahun)
);
alter table public.doc_counter enable row level security;
drop policy if exists doc_counter_select on public.doc_counter;
create policy doc_counter_select on public.doc_counter for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);
-- Penulisan hanya lewat RPC (security definer) — tidak ada policy tulis langsung.

create or replace function public.next_doc_number(p_school_id uuid, p_kode text, p_tahun int)
returns text language plpgsql security definer set search_path = public as $$
declare v_no int;
begin
  if not (public.is_yayasan_admin() or public.is_school_manager(p_school_id)) then
    raise exception 'Tidak berwenang membuat nomor surat.' using errcode = '42501';
  end if;
  insert into public.doc_counter (school_id, kode, tahun, last_no)
  values (p_school_id, upper(p_kode), p_tahun, 1)
  on conflict (school_id, kode, tahun) do update set last_no = doc_counter.last_no + 1
  returning last_no into v_no;
  return lpad(v_no::text, 3, '0') || '/' || upper(p_kode) || '/SARPRAS/' || p_tahun::text;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Barang Habis Pakai (BHP) — master + transaksi (buku persediaan).
-- ---------------------------------------------------------------------
create table if not exists public.barang_habis_pakai (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nama text not null,
  satuan text not null default 'pcs',
  stok numeric(14,2) not null default 0,
  stok_min numeric(14,2) not null default 0,
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists bhp_school_idx on public.barang_habis_pakai (school_id);

create table if not exists public.bhp_transaksi (
  id uuid primary key default gen_random_uuid(),
  bhp_id uuid not null references public.barang_habis_pakai(id) on delete cascade,
  tanggal date not null default current_date,
  jenis text not null check (jenis in ('masuk', 'keluar')),
  jumlah numeric(14,2) not null check (jumlah > 0),
  sumber_tujuan text,           -- pemasok (masuk) / penerima (keluar)
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists bhp_transaksi_bhp_idx on public.bhp_transaksi (bhp_id);

-- OTOMASI stok: masuk menambah, keluar mengurangi; batal transaksi mengembalikan.
create or replace function public.bhp_apply_stok()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.barang_habis_pakai set stok = stok + (case when new.jenis = 'masuk' then new.jumlah else -new.jumlah end) where id = new.bhp_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.barang_habis_pakai set stok = stok + (case when old.jenis = 'masuk' then -old.jumlah else old.jumlah end) where id = old.bhp_id;
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists bhp_apply_stok_ins on public.bhp_transaksi;
create trigger bhp_apply_stok_ins after insert on public.bhp_transaksi for each row execute function public.bhp_apply_stok();
drop trigger if exists bhp_apply_stok_del on public.bhp_transaksi;
create trigger bhp_apply_stok_del after delete on public.bhp_transaksi for each row execute function public.bhp_apply_stok();

alter table public.barang_habis_pakai enable row level security;
drop policy if exists bhp_select on public.barang_habis_pakai;
create policy bhp_select on public.barang_habis_pakai for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);
drop policy if exists bhp_write on public.barang_habis_pakai;
create policy bhp_write on public.barang_habis_pakai for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

alter table public.bhp_transaksi enable row level security;
drop policy if exists bhp_transaksi_select on public.bhp_transaksi;
create policy bhp_transaksi_select on public.bhp_transaksi for select using (
  exists (select 1 from public.barang_habis_pakai b where b.id = bhp_id and (public.is_yayasan_admin() or public.has_school_access(b.school_id)))
);
drop policy if exists bhp_transaksi_write on public.bhp_transaksi;
create policy bhp_transaksi_write on public.bhp_transaksi for all using (
  exists (select 1 from public.barang_habis_pakai b where b.id = bhp_id and (public.is_yayasan_admin() or public.is_school_manager(b.school_id)))
) with check (
  exists (select 1 from public.barang_habis_pakai b where b.id = bhp_id and (public.is_yayasan_admin() or public.is_school_manager(b.school_id)))
);
