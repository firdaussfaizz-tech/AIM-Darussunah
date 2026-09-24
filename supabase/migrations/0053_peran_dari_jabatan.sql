-- =====================================================================
-- SELARASKAN PERAN (user_role) DENGAN JABATAN PEGAWAI (#7).
--
-- Permintaan: "peran disamakan dengan jabatan — masing-masing jabatan
-- dibuatkan perannya". Model akses aplikasi memakai enum peran tetap
-- (admin_yayasan, hr, admin_sekolah, kepala_sekolah, guru, staff,
-- bendahara) yang menjadi dasar seluruh RLS. Karena itu tiap JABATAN
-- (positions) diberi kolom `default_role`: peran login yang tersirat bila
-- seseorang memangku jabatan tsb. Peran akun (user_roles) lalu bisa
-- DISINKRONKAN dari jabatan lewat RPC di bawah — dipicu tombol di halaman
-- Pengguna & Peran, jadi tetap ditinjau manusia (semi-otomatis).
--
-- default_role di-seed dari NAMA jabatan (heuristik kata kunci) HANYA bila
-- masih kosong — Yayasan bisa mengubahnya per jabatan kapan saja. Sinkron
-- hanya MENAMBAH peran yang belum ada (on conflict do nothing); tidak
-- pernah menghapus peran yang sudah diberikan manual.
--
-- Non-destruktif & idempoten. JALANKAN SETELAH 0052.
-- =====================================================================

-- 1. Kolom peran-default pada jabatan.
alter table public.positions
  add column if not exists default_role app_role_enum;

comment on column public.positions.default_role is
  'Peran login (user_role) yang tersirat dari jabatan ini. Dipakai RPC sinkron_peran_dari_jabatan() untuk membuat user_roles pegawai. NULL = jabatan tak otomatis memberi peran.';

-- 2. Seed heuristik dari nama jabatan (hanya bila belum diisi).
update public.positions set default_role = 'kepala_sekolah'
  where default_role is null
    and nama ilike '%kepala sekolah%' and nama not ilike '%wakil%' and nama not ilike '%waka%';

update public.positions set default_role = 'bendahara'
  where default_role is null and nama ilike '%bendahara%' and nama not ilike '%yayasan%';

update public.positions set default_role = 'admin_sekolah'
  where default_role is null
    and (nama ilike '%tata usaha%' or nama ilike '%administrasi sekolah%' or nama ilike '%operator%'
         or nama ilike '%kepala tu%' or nama ilike '%staf tu%' or nama ilike '%ka. tu%');

update public.positions set default_role = 'hr'
  where default_role is null
    and (nama ilike '%hrd%' or nama ilike '%sumber daya manusia%' or nama ilike '%kepegawaian yayasan%');

update public.positions set default_role = 'admin_yayasan'
  where default_role is null
    and (nama ilike '%ketua yayasan%' or nama ilike '%pembina yayasan%' or nama ilike '%pengurus yayasan%'
         or nama ilike '%sekretaris yayasan%' or nama ilike '%direktur%');

update public.positions set default_role = 'guru'
  where default_role is null and jenis = 'guru';

-- 3. RPC sinkron: buat user_roles dari jabatan pegawai yang sudah punya
--    akun login. school_id diisi untuk peran ber-lingkup unit
--    (admin_sekolah/kepala_sekolah/guru); peran lintas-yayasan
--    (admin_yayasan/hr/bendahara/staff) memakai school_id NULL.
--    Aman & idempoten: on conflict (user_id, role, school_id) do nothing.
create or replace function public.sinkron_peran_dari_jabatan()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_before bigint;
  v_after bigint;
begin
  if not public.is_yayasan_admin() then
    raise exception 'Hanya Admin Yayasan/HR yang boleh menyinkronkan peran.' using errcode = '42501';
  end if;

  select count(*) into v_before from public.user_roles;

  insert into public.user_roles (user_id, role, school_id, employee_id)
  select
    e.user_id,
    p.default_role,
    case when p.default_role in ('admin_sekolah', 'kepala_sekolah', 'guru') then e.school_id else null end,
    e.id
  from public.employees e
  join public.positions p on p.id = e.position_id
  where e.user_id is not null
    and p.default_role is not null
    and e.status = 'aktif'
  on conflict (user_id, role, school_id) do nothing;

  select count(*) into v_after from public.user_roles;
  return (v_after - v_before)::int;
end;
$$;
