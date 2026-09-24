-- =====================================================================
-- IZINKAN ADMIN/KEPALA SEKOLAH MENGELOLA TUGAS TAMBAHAN PEGAWAI (#5).
--
-- Temuan uji coba: Admin Sekolah & Kepala Sekolah tidak bisa menetapkan
-- Tugas Tambahan ke pegawai — UI mengizinkan (canManage), tetapi RLS pada
-- employee_tugas_tambahan hanya mengizinkan Yayasan, sehingga penyimpanan
-- ditolak. Tabel tugas_tambahan / employee_tugas_tambahan dibuat langsung
-- di Supabase tanpa file migrasi (lihat Risiko R2 pada Peta Integrasi),
-- jadi kebijakan lama tidak tercatat di repo — migrasi ini MENAMBAH
-- kebijakan permisif baru (RLS menggabungkan kebijakan permisif dengan
-- OR), memberi manajer sekolah akses tulis pada tugas tambahan pegawai
-- di UNIT-nya sendiri. Yayasan tetap berwenang penuh lewat kebijakan lama.
--
-- Non-destruktif & idempoten: hanya menambah kebijakan (drop-if-exists lalu
-- create), tidak mengubah data. Aman dijalankan ulang. JALANKAN SETELAH 0049.
-- =====================================================================

-- Master tugas tambahan boleh DIBACA semua pengguna login (dibutuhkan
-- dropdown penetapan). Penulisan master tetap kewenangan Yayasan (tidak
-- ditambah kebijakan tulis di sini).
alter table public.tugas_tambahan enable row level security;
drop policy if exists tugas_tambahan_select_login on public.tugas_tambahan;
create policy tugas_tambahan_select_login on public.tugas_tambahan
  for select using (auth.uid() is not null);

-- Penetapan tugas tambahan ke pegawai (employee_tugas_tambahan):
-- terlihat & dapat dikelola oleh Yayasan ATAU manajer sekolah pada unit
-- pegawai ybs. Pegawai boleh melihat penetapan miliknya sendiri.
alter table public.employee_tugas_tambahan enable row level security;

drop policy if exists employee_tugas_tambahan_select_sekolah on public.employee_tugas_tambahan;
create policy employee_tugas_tambahan_select_sekolah on public.employee_tugas_tambahan
  for select using (
    public.is_yayasan_admin()
    or public.has_school_access(public.employee_school_id(employee_id))
    or employee_id = public.current_employee_id()
  );

drop policy if exists employee_tugas_tambahan_write_sekolah on public.employee_tugas_tambahan;
create policy employee_tugas_tambahan_write_sekolah on public.employee_tugas_tambahan
  for all using (
    public.is_yayasan_admin()
    or public.has_school_access(public.employee_school_id(employee_id))
  ) with check (
    public.is_yayasan_admin()
    or public.has_school_access(public.employee_school_id(employee_id))
  );
