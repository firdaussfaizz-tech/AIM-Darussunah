-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: MODUL BEBAN KERJA (menutup celah).
--
-- Modul 'beban_kerja' sudah terdaftar di matriks izin (0055) TETAPI tabel
-- datanya (employee_beban_kerja, beban_kerja_settings) dibuat langsung di
-- Supabase tanpa file migrasi, sehingga BELUM tersambung ke has_perm().
-- Akibatnya mencentang "Beban Kerja" di layar Pengguna & Peran belum
-- berefek di database. Migrasi ini menyambungkannya.
--
-- METODE: sama seperti 0061 — kebijakan RESTRICTIVE yang di-AND-kan ke
-- kebijakan permissive yang sudah ada, jadi LINGKUP & CARVE-OUT lama tetap
-- utuh; migrasi ini hanya MENAMBAH syarat "punya izin modul beban_kerja".
--
--   employee_beban_kerja : mode 'full'. SELECT boleh oleh pemegang izin
--     ATAU pemilik datanya sendiri (employee_id = current_employee_id()).
--     TULIS (insert/ubah/hapus) HANYA pemegang izin — pegawai tidak boleh
--     mengubah beban kerjanya sendiri (itu tugas manajer).
--   beban_kerja_settings : mode 'write'. SELECT sengaja DIBIARKAN terbuka
--     karena dibaca banyak halaman (Dasbor, Beban Kerja, Akademik) untuk
--     menghitung standar; hanya TULIS yang digerbang izin.
--
-- Non-destruktif & idempoten. JALANKAN SETELAH 0061.
-- =====================================================================

-- Helper generik dibuang di akhir 0061; buat ulang identik lalu pakai.
create or replace function public._pasang_perm_rls(
  p_tabel text, p_modul text, p_mode text,
  p_extra_lihat text default null,
  p_extra_tulis text default null
) returns void language plpgsql as $$
declare
  v_lihat text := format('public.has_perm(%L, %L)', p_modul, 'lihat')
    || case when p_extra_lihat is not null then ' or (' || p_extra_lihat || ')' else '' end;
  v_tambah text := format('public.has_perm(%L, %L)', p_modul, 'tambah')
    || case when p_extra_tulis is not null then ' or (' || p_extra_tulis || ')' else '' end;
  v_ubah text := format('public.has_perm(%L, %L)', p_modul, 'ubah')
    || case when p_extra_tulis is not null then ' or (' || p_extra_tulis || ')' else '' end;
  v_hapus text := format('public.has_perm(%L, %L)', p_modul, 'hapus')
    || case when p_extra_tulis is not null then ' or (' || p_extra_tulis || ')' else '' end;
begin
  -- Lewati tabel yang tidak ada di database ini (tahan drift skema repo↔DB).
  if to_regclass('public.' || p_tabel) is null then
    return;
  end if;
  if p_mode = 'full' then
    execute format('drop policy if exists perm_select on public.%I', p_tabel);
    execute format('create policy perm_select on public.%I as restrictive for select using (%s)', p_tabel, v_lihat);
  end if;
  execute format('drop policy if exists perm_insert on public.%I', p_tabel);
  execute format('create policy perm_insert on public.%I as restrictive for insert with check (%s)', p_tabel, v_tambah);
  execute format('drop policy if exists perm_update on public.%I', p_tabel);
  execute format('create policy perm_update on public.%I as restrictive for update using (%s) with check (%s)', p_tabel, v_ubah, v_ubah);
  execute format('drop policy if exists perm_delete on public.%I', p_tabel);
  execute format('create policy perm_delete on public.%I as restrictive for delete using (%s)', p_tabel, v_hapus);
end;
$$;

do $$
begin
  -- Data beban kerja per pegawai: baca oleh pemegang izin ATAU diri sendiri;
  -- tulis hanya pemegang izin (manajer), bukan pegawai atas dirinya.
  perform public._pasang_perm_rls('employee_beban_kerja', 'beban_kerja', 'full',
    'employee_id = public.current_employee_id()', null);

  -- Pengaturan beban kerja (singleton): select dibiarkan terbuka (dibaca
  -- banyak modul); hanya tulis yang digerbang izin 'beban_kerja'.
  perform public._pasang_perm_rls('beban_kerja_settings', 'beban_kerja', 'write');
end $$;

-- Helper hanya dibutuhkan saat migrasi — buang agar tak tertinggal.
drop function if exists public._pasang_perm_rls(text, text, text, text, text);
