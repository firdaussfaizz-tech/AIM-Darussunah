-- 0119: Auto-seed izin default untuk PERAN BARU + backfill peran yang kosong.
--
-- Masalah: seed izin di 0055 hanya berjalan sekali. Peran yang dibuat belakangan
-- (dari Jabatan baru) mulai dengan role_permissions KOSONG — sehingga peran
-- dinamis murni jadi tanpa akses sampai diatur manual di matriks.
--
-- Solusi:
--   1) Trigger AFTER INSERT pada roles → isi role_permissions dari default
--      Tingkat Akses (roles_tingkat_default, 0055). Yayasan tetap bisa mengubah
--      lewat matriks "Atur Izin per Modul".
--   2) Backfill SATU KALI: peran non-super yang saat ini belum punya baris izin
--      sama sekali, diisi dari default tingkat aksesnya.
--
-- Catatan: hanya pada INSERT (bukan UPDATE tingkat_akses) agar tak menimpa
-- penyesuaian manual. Bila tingkat_akses peran diubah, pakai tombol
-- "Terapkan Default" di matriks. Idempoten & non-destruktif.

create or replace function public.seed_role_permissions_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Super admin: izin implisit (my_permissions memberi semua), tak perlu baris.
  if new.is_admin_yayasan then
    return new;
  end if;
  insert into public.role_permissions (role_id, modul, aksi)
  select new.id, m.kode, a.aksi
  from public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus')) a(aksi)
  where public.roles_tingkat_default(new.tingkat_akses, m.kode, a.aksi)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists seed_role_permissions_default_trg on public.roles;
create trigger seed_role_permissions_default_trg
  after insert on public.roles
  for each row execute function public.seed_role_permissions_default();

-- Backfill satu kali: peran non-super yang BELUM punya baris izin sama sekali.
insert into public.role_permissions (role_id, modul, aksi)
select r.id, m.kode, a.aksi
from public.roles r
cross join public.modules m
cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus')) a(aksi)
where not r.is_admin_yayasan
  and public.roles_tingkat_default(r.tingkat_akses, m.kode, a.aksi)
  and not exists (select 1 from public.role_permissions rp where rp.role_id = r.id)
on conflict do nothing;

notify pgrst, 'reload schema';
