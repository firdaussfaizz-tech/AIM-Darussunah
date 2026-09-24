-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: KEPEGAWAIAN INTI (pegawai, presensi, cuti).
--
-- Menegakkan has_perm(<modul>, <aksi>) di samping lingkup unit
-- (has_school_access) untuk tabel harian Kepegawaian. Carve-out identitas
-- DIPERTAHANKAN: pegawai tetap melihat & (di mana relevan) mengubah datanya
-- sendiri. Trigger biodata mandiri (0041) & alur persetujuan cuti (0029)
-- tetap berlaku — kebijakan cuti di sini me-replikasi 0029 + menambah
-- gerbang izin modul 'cuti' pada cabang keputusan manajer.
--
-- Perubahan perilaku yang DISENGAJA: aksi tulis kini butuh izin modul pada
-- aksi terkait (mis. hapus pegawai butuh 'pegawai:hapus'). Default peran
-- manajer_unit sudah mencakup aksi-aksi ini — tinjau & sesuaikan di matriks
-- (mis. lepas 'hapus' untuk peran tertentu bila perlu).
--
-- Non-destruktif (ganti kebijakan) & idempoten. JALANKAN SETELAH 0059.
-- =====================================================================

-- =====================================================================
-- MODUL 'pegawai' — employees + sub-tabel biodata.
-- =====================================================================
drop policy if exists employees_select on public.employees;
drop policy if exists employees_insert on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_delete on public.employees;

create policy employees_select on public.employees for select using (
  (public.has_perm('pegawai', 'lihat') and public.has_school_access(school_id)) or user_id = auth.uid()
);
create policy employees_insert on public.employees for insert with check (
  public.has_perm('pegawai', 'tambah') and public.has_school_access(school_id)
);
-- Cabang self (user_id = auth.uid()) dipertahankan; kolom yang boleh diubah
-- sendiri tetap dibatasi trigger trg_employees_self_update_guard (0041).
create policy employees_update on public.employees for update using (
  (public.has_perm('pegawai', 'ubah') and public.has_school_access(school_id)) or user_id = auth.uid()
) with check (
  (public.has_perm('pegawai', 'ubah') and public.has_school_access(school_id)) or user_id = auth.uid()
);
create policy employees_delete on public.employees for delete using (
  public.has_perm('pegawai', 'hapus') and public.has_school_access(school_id)
);

-- Sub-tabel biodata (pola sama; carve-out: pegawai lihat miliknya).
-- employee_education (kebijakan lama: edu_select / edu_write)
drop policy if exists edu_select on public.employee_education;
drop policy if exists edu_write on public.employee_education;
create policy edu_select on public.employee_education for select using (
  (public.has_perm('pegawai', 'lihat') and public.has_school_access(public.employee_school_id(employee_id))) or employee_id = public.current_employee_id()
);
create policy edu_insert on public.employee_education for insert with check (
  public.has_perm('pegawai', 'tambah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy edu_update on public.employee_education for update using (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy edu_delete on public.employee_education for delete using (
  public.has_perm('pegawai', 'hapus') and public.has_school_access(public.employee_school_id(employee_id))
);

-- employee_work_history (work_select / work_write)
drop policy if exists work_select on public.employee_work_history;
drop policy if exists work_write on public.employee_work_history;
create policy work_select on public.employee_work_history for select using (
  (public.has_perm('pegawai', 'lihat') and public.has_school_access(public.employee_school_id(employee_id))) or employee_id = public.current_employee_id()
);
create policy work_insert on public.employee_work_history for insert with check (
  public.has_perm('pegawai', 'tambah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy work_update on public.employee_work_history for update using (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy work_delete on public.employee_work_history for delete using (
  public.has_perm('pegawai', 'hapus') and public.has_school_access(public.employee_school_id(employee_id))
);

-- employee_documents (docs_select / docs_write)
drop policy if exists docs_select on public.employee_documents;
drop policy if exists docs_write on public.employee_documents;
create policy docs_select on public.employee_documents for select using (
  (public.has_perm('pegawai', 'lihat') and public.has_school_access(public.employee_school_id(employee_id))) or employee_id = public.current_employee_id()
);
create policy docs_insert on public.employee_documents for insert with check (
  public.has_perm('pegawai', 'tambah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy docs_update on public.employee_documents for update using (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy docs_delete on public.employee_documents for delete using (
  public.has_perm('pegawai', 'hapus') and public.has_school_access(public.employee_school_id(employee_id))
);

-- employment_contracts (contracts_select / contracts_write)
drop policy if exists contracts_select on public.employment_contracts;
drop policy if exists contracts_write on public.employment_contracts;
create policy contracts_select on public.employment_contracts for select using (
  (public.has_perm('pegawai', 'lihat') and public.has_school_access(public.employee_school_id(employee_id))) or employee_id = public.current_employee_id()
);
create policy contracts_insert on public.employment_contracts for insert with check (
  public.has_perm('pegawai', 'tambah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy contracts_update on public.employment_contracts for update using (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.has_perm('pegawai', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy contracts_delete on public.employment_contracts for delete using (
  public.has_perm('pegawai', 'hapus') and public.has_school_access(public.employee_school_id(employee_id))
);

-- =====================================================================
-- MODUL 'presensi' — attendance.
-- =====================================================================
drop policy if exists attendance_select on public.attendance;
drop policy if exists attendance_write on public.attendance;

create policy attendance_select on public.attendance for select using (
  (public.has_perm('presensi', 'lihat') and public.has_school_access(public.employee_school_id(employee_id))) or employee_id = public.current_employee_id()
);
create policy attendance_insert on public.attendance for insert with check (
  public.has_perm('presensi', 'tambah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy attendance_update on public.attendance for update using (
  public.has_perm('presensi', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.has_perm('presensi', 'ubah') and public.has_school_access(public.employee_school_id(employee_id))
);
create policy attendance_delete on public.attendance for delete using (
  public.has_perm('presensi', 'hapus') and public.has_school_access(public.employee_school_id(employee_id))
);

-- =====================================================================
-- MODUL 'cuti' — leave_requests (leave_types dibiarkan: referensi Yayasan).
-- Replikasi alur persetujuan 0029 + gerbang izin modul 'cuti'.
-- =====================================================================
drop policy if exists leave_select on public.leave_requests;
drop policy if exists leave_insert on public.leave_requests;
drop policy if exists leave_delete on public.leave_requests;

create policy leave_select on public.leave_requests for select using (
  (public.has_perm('cuti', 'lihat') and public.has_school_access(public.employee_school_id(employee_id))) or employee_id = public.current_employee_id()
);
-- Pengajuan: pegawai mengajukan untuk dirinya, ATAU manajer ber-izin
-- 'cuti:tambah' mengajukan atas nama pegawai di unitnya.
create policy leave_insert on public.leave_requests for insert with check (
  employee_id = public.current_employee_id()
  or (public.has_perm('cuti', 'tambah') and public.has_school_access(public.employee_school_id(employee_id)))
);
create policy leave_delete on public.leave_requests for delete using (
  public.has_perm('cuti', 'hapus') and public.has_school_access(public.employee_school_id(employee_id))
);

-- Update (keputusan) — replikasi 3 kebijakan 0029; cabang manajer diberi
-- gerbang has_perm('cuti','ubah'). Cabang self tetap identitas murni.
drop policy if exists leave_update on public.leave_requests;
drop policy if exists leave_update_self on public.leave_requests;
drop policy if exists leave_update_sekolah on public.leave_requests;
drop policy if exists leave_update_yayasan on public.leave_requests;

create policy leave_update_self on public.leave_requests for update
  using (employee_id = public.current_employee_id() and status = 'pending')
  with check (employee_id = public.current_employee_id() and status = 'pending');

create policy leave_update_sekolah on public.leave_requests for update
  using (
    public.has_perm('cuti', 'ubah')
    and status = 'pending'
    and public.has_school_access(public.employee_school_id(employee_id))
    and not public.leave_target_is_manager(employee_id)
  )
  with check (
    public.has_perm('cuti', 'ubah')
    and public.has_school_access(public.employee_school_id(employee_id))
    and not public.leave_target_is_manager(employee_id)
    and (
      (status in ('disetujui', 'ditolak') and not public.leave_type_is_clty(leave_type_id))
      or (status in ('menunggu_yayasan', 'ditolak') and public.leave_type_is_clty(leave_type_id))
    )
  );

create policy leave_update_yayasan on public.leave_requests for update
  using (
    public.has_perm('cuti', 'ubah')
    and public.is_yayasan_admin()
    and (
      (status = 'pending' and public.leave_target_is_manager(employee_id))
      or status = 'menunggu_yayasan'
    )
  )
  with check (
    public.has_perm('cuti', 'ubah') and public.is_yayasan_admin() and status in ('disetujui', 'ditolak')
  );
