-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: MODUL DATA SISWA (pola/template).
--
-- Menulis ulang kebijakan RLS tabel siswa & siswa_dokumen agar menegakkan
-- izin per-aksi (has_perm('siswa', ...)) DI SAMPING lingkup unit
-- (has_school_access). Ini pola yang akan diikuti modul-modul lain pada
-- migrasi berikutnya.
--
-- Yang dipertahankan:
--   - Lingkup data (unit vs yayasan) tetap via has_school_access().
--   - Carve-out identitas: Wali Kelas tetap BISA MELIHAT siswa rombelnya
--     (is_wali_kelas_of_siswa), terlepas dari izin modul.
--
-- Perubahan perilaku yang DISENGAJA: sebelumnya siapa pun yang punya baris
-- peran ber-school_id (termasuk staf/guru) bisa MENULIS biodata siswa
-- lewat has_school_access. Kini menulis butuh izin modul 'siswa' pada aksi
-- terkait — sesuai tujuan kontrol akses per peran.
--
-- Non-destruktif (hanya mengganti kebijakan) & idempoten. JALANKAN SETELAH 0055.
-- =====================================================================

-- ---- siswa ----------------------------------------------------------
drop policy if exists siswa_select on public.siswa;
drop policy if exists siswa_write on public.siswa;

create policy siswa_select on public.siswa for select using (
  (public.has_perm('siswa', 'lihat') and public.has_school_access(school_id))
  or public.is_wali_kelas_of_siswa(id)
);
create policy siswa_insert on public.siswa for insert with check (
  public.has_perm('siswa', 'tambah') and public.has_school_access(school_id)
);
create policy siswa_update on public.siswa for update using (
  public.has_perm('siswa', 'ubah') and public.has_school_access(school_id)
) with check (
  public.has_perm('siswa', 'ubah') and public.has_school_access(school_id)
);
create policy siswa_delete on public.siswa for delete using (
  public.has_perm('siswa', 'hapus') and public.has_school_access(school_id)
);

-- ---- siswa_dokumen (bagian dari modul 'siswa') ----------------------
drop policy if exists siswa_dokumen_select on public.siswa_dokumen;
drop policy if exists siswa_dokumen_write on public.siswa_dokumen;

create policy siswa_dokumen_select on public.siswa_dokumen for select using (
  (public.has_perm('siswa', 'lihat') and public.has_school_access(public.siswa_school_id(siswa_id)))
  or public.is_wali_kelas_of_siswa(siswa_id)
);
create policy siswa_dokumen_insert on public.siswa_dokumen for insert with check (
  public.has_perm('siswa', 'tambah') and public.has_school_access(public.siswa_school_id(siswa_id))
);
create policy siswa_dokumen_update on public.siswa_dokumen for update using (
  public.has_perm('siswa', 'ubah') and public.has_school_access(public.siswa_school_id(siswa_id))
) with check (
  public.has_perm('siswa', 'ubah') and public.has_school_access(public.siswa_school_id(siswa_id))
);
create policy siswa_dokumen_delete on public.siswa_dokumen for delete using (
  public.has_perm('siswa', 'hapus') and public.has_school_access(public.siswa_school_id(siswa_id))
);
