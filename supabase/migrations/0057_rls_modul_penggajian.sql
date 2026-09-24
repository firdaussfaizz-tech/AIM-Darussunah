-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: MODUL PENGGAJIAN.
--
-- payroll_runs & payroll_details ditegakkan per-aksi (has_perm('penggajian',
-- ...)). Penggajian bersifat YAYASAN-WIDE (tanpa lingkup unit) — secara
-- default hanya peran tingkat 'yayasan_penuh'/super yang memiliki izin ini
-- (lihat roles_tingkat_default), sehingga perilaku "hanya Yayasan/HR"
-- dipertahankan; admin bisa memberi izin ke peran lain lewat matriks.
--
-- Carve-out identitas DIPERTAHANKAN: pegawai tetap melihat slip gaji &
-- periode gajinya sendiri (payroll_runs_select_self dari 0011 + cabang
-- employee_id = current_employee_id() pada payroll_details).
--
-- Non-destruktif (ganti kebijakan) & idempoten. JALANKAN SETELAH 0056.
-- =====================================================================

-- ---- payroll_runs ---------------------------------------------------
drop policy if exists payroll_runs_select on public.payroll_runs;
drop policy if exists payroll_runs_write on public.payroll_runs;
-- payroll_runs_select_self (0011) SENGAJA dibiarkan — akses slip sendiri.

create policy payroll_runs_select on public.payroll_runs for select using (
  public.has_perm('penggajian', 'lihat')
);
create policy payroll_runs_insert on public.payroll_runs for insert with check (
  public.has_perm('penggajian', 'tambah')
);
create policy payroll_runs_update on public.payroll_runs for update using (
  public.has_perm('penggajian', 'ubah')
) with check (
  public.has_perm('penggajian', 'ubah')
);
create policy payroll_runs_delete on public.payroll_runs for delete using (
  public.has_perm('penggajian', 'hapus')
);

-- ---- payroll_details ------------------------------------------------
drop policy if exists payroll_details_select on public.payroll_details;
drop policy if exists payroll_details_write on public.payroll_details;

create policy payroll_details_select on public.payroll_details for select using (
  public.has_perm('penggajian', 'lihat') or employee_id = public.current_employee_id()
);
create policy payroll_details_insert on public.payroll_details for insert with check (
  public.has_perm('penggajian', 'tambah')
);
create policy payroll_details_update on public.payroll_details for update using (
  public.has_perm('penggajian', 'ubah')
) with check (
  public.has_perm('penggajian', 'ubah')
);
create policy payroll_details_delete on public.payroll_details for delete using (
  public.has_perm('penggajian', 'hapus')
);
