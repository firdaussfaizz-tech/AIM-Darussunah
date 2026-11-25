-- 0120: Matriks izin lebih rinci + aksi 'sahkan' (Pengesahan).
--
-- A. Akademik/Sarpras/Keuangan dipecah per SUB-FITUR (seperti Kepegawaian/Kesiswaan).
-- B. Aksi baru 'sahkan' (pengesahan) di samping lihat/tambah/ubah/hapus.
--
-- Catatan RLS: 'akademik' & 'sarpras' TIDAK dipakai has_perm di RLS (hanya gating
-- halaman), jadi aman dihapus. 'keuangan' DIPAKAI has_perm di RLS tabel keuangan
-- (0058) — maka has_perm di-special-case agar 'keuangan' terpenuhi oleh grant
-- sub-modul keu_*, sehingga 0058 TIDAK perlu diubah. Jembatan enum/Waka tetap
-- memakai roles_tingkat_default('...','keuangan',...) yang dipertahankan.

-- =====================================================================
-- 1. Aksi 'sahkan' pada role_permissions.
-- =====================================================================
alter table public.role_permissions drop constraint if exists role_permissions_aksi_check;
alter table public.role_permissions add constraint role_permissions_aksi_check
  check (aksi in ('lihat', 'tambah', 'ubah', 'hapus', 'sahkan'));

-- =====================================================================
-- 2. Modul baru per sub-fitur (area tetap Akademik/Sarpras/Keuangan).
-- =====================================================================
insert into public.modules (kode, nama, area, urutan) values
  ('akad_dashboard', 'Dashboard Akademik', 'Akademik', 1601),
  ('akad_kalender', 'Kalender Akademik', 'Akademik', 1602),
  ('akad_mapel', 'Mata Pelajaran', 'Akademik', 1603),
  ('akad_penugasan', 'Penugasan Mengajar', 'Akademik', 1604),
  ('akad_jadwal', 'Jadwal Pelajaran', 'Akademik', 1605),
  ('akad_jurnal', 'Jurnal KBM', 'Akademik', 1606),
  ('akad_rekap_kbm', 'Rekap Kehadiran Mengajar', 'Akademik', 1607),
  ('akad_kurikulum', 'Kurikulum & KKTP', 'Akademik', 1608),
  ('akad_kurikulum_islam', 'Kurikulum Islam Plus', 'Akademik', 1609),
  ('akad_kurikulum_satuan', 'Kurikulum Satuan Pendidikan', 'Akademik', 1610),
  ('akad_ekskul', 'Ekstrakurikuler', 'Akademik', 1611),
  ('akad_perangkat', 'Perangkat Ajar & Monev', 'Akademik', 1612),
  ('akad_ppdb', 'PPDB', 'Akademik', 1613),
  ('srp_dashboard', 'Dashboard Sarpras', 'Sarpras', 1701),
  ('srp_perencanaan', 'Perencanaan', 'Sarpras', 1702),
  ('srp_pengadaan', 'Pengadaan', 'Sarpras', 1703),
  ('srp_penerimaan', 'Penerimaan & Penyaluran', 'Sarpras', 1704),
  ('srp_penggunaan', 'Penggunaan', 'Sarpras', 1705),
  ('srp_inventaris', 'Inventaris', 'Sarpras', 1706),
  ('srp_ruangan', 'Ruangan', 'Sarpras', 1707),
  ('srp_bhp', 'Barang Habis Pakai', 'Sarpras', 1708),
  ('srp_inventarisasi', 'Inventarisasi', 'Sarpras', 1709),
  ('srp_pemeliharaan', 'Pemeliharaan', 'Sarpras', 1710),
  ('srp_penghapusan', 'Penghapusan', 'Sarpras', 1711),
  ('srp_kodefikasi', 'Kodefikasi', 'Sarpras', 1712),
  ('srp_dokumen', 'Dokumen & Formulir', 'Sarpras', 1713),
  ('srp_kebijakan', 'Kebijakan & SOP', 'Sarpras', 1714),
  ('keu_dashboard', 'Dashboard Keuangan', 'Keuangan', 1801),
  ('keu_rkas', 'RKAS / Anggaran', 'Keuangan', 1802),
  ('keu_bukukas', 'Buku Kas', 'Keuangan', 1803),
  ('keu_laporan', 'Laporan', 'Keuangan', 1804)
on conflict (kode) do update set nama = excluded.nama, area = excluded.area, urutan = excluded.urutan;

-- =====================================================================
-- 3. Migrasi grant lama (umbrella → sub-modul) agar akses yang ada tetap.
-- =====================================================================
insert into public.role_permissions (role_id, modul, aksi)
  select rp.role_id, m.kode, rp.aksi
  from public.role_permissions rp
  join public.modules m on m.area = 'Akademik'
  where rp.modul = 'akademik'
  on conflict do nothing;

insert into public.role_permissions (role_id, modul, aksi)
  select rp.role_id, m.kode, rp.aksi
  from public.role_permissions rp
  join public.modules m on m.area = 'Sarpras'
  where rp.modul = 'sarpras'
  on conflict do nothing;

insert into public.role_permissions (role_id, modul, aksi)
  select rp.role_id, m.kode, rp.aksi
  from public.role_permissions rp
  join public.modules m on m.area = 'Keuangan'
  where rp.modul = 'keuangan'
  on conflict do nothing;

-- =====================================================================
-- 4. Hapus modul payung lama (cascade grant payung; sub-modul sudah terisi).
-- =====================================================================
delete from public.modules where kode in ('akademik', 'sarpras', 'keuangan');

-- =====================================================================
-- 5. Default izin per tingkat: 'sahkan' hanya yayasan_penuh; bendahara → keu_*.
-- =====================================================================
create or replace function public.roles_tingkat_default(p_tingkat text, p_modul text, p_aksi text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_aksi = 'sahkan' then p_tingkat = 'yayasan_penuh'
    when p_tingkat = 'yayasan_penuh' then true
    when p_tingkat = 'manajer_unit' then p_modul not in ('penggajian', 'pengguna', 'log', 'notifikasi', 'struktur')
    when p_tingkat = 'bendahara' then p_modul in ('spp', 'keuangan', 'keu_dashboard', 'keu_rkas', 'keu_bukukas', 'keu_laporan')
    else false
  end;
$$;

-- =====================================================================
-- 6. has_perm: 'keuangan' (RLS 0058) terpenuhi oleh grant sub-modul keu_*.
--    Super admin & jembatan enum/Waka tak berubah; aksi 'sahkan' ditangani
--    roles_tingkat_default (hanya yayasan_penuh di jembatan; super admin = semua).
-- =====================================================================
create or replace function public.has_perm(p_modul text, p_aksi text)
returns boolean language sql security definer stable set search_path = public as $$
  select
    exists (
      select 1 from public.user_roles ur left join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and (ur.role = 'admin_yayasan' or r.is_admin_yayasan)
    )
    or exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid() and rp.aksi = p_aksi and (
        rp.modul = p_modul
        or (p_modul = 'keuangan' and rp.modul in ('keu_dashboard', 'keu_rkas', 'keu_bukukas', 'keu_laporan'))
      )
    )
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role is not null
        and public.roles_tingkat_default(public.enum_to_tingkat(ur.role), p_modul, p_aksi)
    )
    or (
      public.roles_tingkat_default('manajer_unit', p_modul, p_aksi)
      and exists (
        select 1 from public.employees e
        join public.positions p on p.id = e.position_id
        where e.user_id = auth.uid() and p.beri_akses_manajer
      )
    );
$$;

-- =====================================================================
-- 7. my_permissions: enumerasi super admin & jembatan menyertakan 'sahkan'.
-- =====================================================================
create or replace function public.my_permissions()
returns table (modul text, aksi text) language sql security definer stable set search_path = public as $$
  with su as (
    select exists (
      select 1 from public.user_roles ur left join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and (ur.role = 'admin_yayasan' or r.is_admin_yayasan)
    ) as is_su,
    exists (
      select 1 from public.employees e
      join public.positions p on p.id = e.position_id
      where e.user_id = auth.uid() and p.beri_akses_manajer
    ) as is_waka
  )
  select m.kode, a.aksi
  from public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus'), ('sahkan')) a(aksi)
  cross join su where su.is_su
  union
  select rp.modul, rp.aksi
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = auth.uid()
  union
  select m.kode, a.aksi
  from public.user_roles ur
  cross join public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus'), ('sahkan')) a(aksi)
  where ur.user_id = auth.uid() and ur.role is not null
    and public.roles_tingkat_default(public.enum_to_tingkat(ur.role), m.kode, a.aksi)
  union
  select m.kode, a.aksi
  from public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus'), ('sahkan')) a(aksi)
  cross join su where su.is_waka and public.roles_tingkat_default('manajer_unit', m.kode, a.aksi);
$$;

-- =====================================================================
-- 8. Trigger auto-seed (0119) disertakan aksi 'sahkan'.
-- =====================================================================
create or replace function public.seed_role_permissions_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin_yayasan then
    return new;
  end if;
  insert into public.role_permissions (role_id, modul, aksi)
  select new.id, m.kode, a.aksi
  from public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus'), ('sahkan')) a(aksi)
  where public.roles_tingkat_default(new.tingkat_akses, m.kode, a.aksi)
  on conflict do nothing;
  return new;
end $$;

notify pgrst, 'reload schema';
