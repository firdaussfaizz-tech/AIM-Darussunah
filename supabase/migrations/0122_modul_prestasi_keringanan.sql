-- 0122: Modul matriks untuk Prestasi & Keringanan (agar diatur Yayasan).
--
-- Dua fitur ini belum punya modul di matriks sehingga aksesnya tak dapat
-- dikontrol Yayasan. Ditambahkan sebagai modul (area Kesiswaan), lalu halaman
-- Prestasi/Keringanan digate dengan can() (lihat perubahan klien).
--
-- CATATAN AMAN: hanya menyemai izin default untuk DUA modul BARU ini pada peran
-- yang sudah ada. TIDAK menyentuh modul lain — supaya pembatasan yang sudah
-- diset Yayasan (mis. mencabut suatu modul dari sebuah peran) tidak tertimpa.

-- 1. Modul baru.
insert into public.modules (kode, nama, area, urutan) values
  ('prestasi', 'Prestasi Siswa', 'Kesiswaan', 1250),
  ('keringanan', 'Keringanan Biaya', 'Kesiswaan', 1260)
on conflict (kode) do update set nama = excluded.nama, area = excluded.area, urutan = excluded.urutan;

-- 2. Default tingkat: 'keringanan' juga untuk Bendahara (fitur biaya siswa).
create or replace function public.roles_tingkat_default(p_tingkat text, p_modul text, p_aksi text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_aksi = 'sahkan' then p_tingkat = 'yayasan_penuh'
    when p_tingkat = 'yayasan_penuh' then true
    when p_tingkat = 'manajer_unit' then p_modul not in ('penggajian', 'pengguna', 'log', 'notifikasi', 'struktur')
    when p_tingkat = 'bendahara' then p_modul in ('spp', 'keringanan', 'keuangan', 'keu_dashboard', 'keu_rkas', 'keu_bukukas', 'keu_laporan')
    else false
  end;
$$;

-- 3. Seed AMAN: hanya modul baru (prestasi, keringanan) untuk peran non-super
--    yang sudah ada, sesuai default tingkatnya. Modul lain tak disentuh.
insert into public.role_permissions (role_id, modul, aksi)
select r.id, m.kode, a.aksi
from public.roles r
cross join public.modules m
cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus'), ('sahkan')) a(aksi)
where not r.is_admin_yayasan
  and m.kode in ('prestasi', 'keringanan')
  and public.roles_tingkat_default(r.tingkat_akses, m.kode, a.aksi)
on conflict do nothing;

notify pgrst, 'reload schema';
