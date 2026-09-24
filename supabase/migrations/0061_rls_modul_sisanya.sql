-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: MODUL SISANYA (tuntas).
--
-- Modul: kelas_ta, presensi_siswa, nilai_rapor, kinerja, okr_kpi,
-- pelatihan, kalender_libur, struktur, akademik, sarpras, sistem
-- (pengguna/log/notifikasi).
--
-- METODE: kebijakan RESTRICTIVE. Kebijakan restrictive di-AND-kan dengan
-- kebijakan permissive yang sudah ada — jadi LINGKUP & CARVE-OUT lama
-- (unit, wali kelas, guru pengampu, pembina, diri sendiri) TETAP UTUH;
-- kebijakan ini hanya MENAMBAH syarat "punya izin modul pada aksi tsb".
-- Carve-out identitas disertakan sebagai cabang OR agar wali/guru/diri
-- sendiri tidak ikut terblokir. Fungsi security-definer (trigger email,
-- posting kas, next_doc_number, auto-inventaris) tak terpengaruh RLS.
--
-- Tabel referensi/dropdown (schools, positions, tahun_ajaran,
-- mata_pelajaran, leave_types, school_holidays, kodefikasi aset) SENGAJA
-- tidak diberi restrictive SELECT agar dropdown tetap terbaca semua
-- pengguna; hanya aksi tulisnya yang digerbang izin.
--
-- Non-destruktif & idempoten. JALANKAN SETELAH 0060.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper generik: pasang kebijakan restrictive pada satu tabel.
--   mode 'full'      : select+insert+update+delete digerbang izin.
--   mode 'write'     : hanya insert+update+delete (select tetap terbuka).
-- p_extra_* : cabang OR carve-out identitas (SQL boolean) atau NULL.
-- ---------------------------------------------------------------------
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
  -- ============ SARPRAS (manajer; tanpa carve-out) ==================
  perform public._pasang_perm_rls(t, 'sarpras', 'full') from unnest(array[
    'aset', 'ruangan', 'aset_opname', 'aset_opname_item', 'aset_pemeliharaan_log',
    'aset_penggunaan', 'aset_penghapusan', 'aset_penghapusan_item', 'aset_penyaluran',
    'barang_habis_pakai', 'bhp_transaksi', 'dka_pemeliharaan_item', 'dka_pengadaan_proses',
    'dka_usulan', 'dka_usulan_item'
  ]) as t;
  -- Referensi sarpras (select terbuka; tulis digerbang).
  perform public._pasang_perm_rls(t, 'sarpras', 'write') from unnest(array[
    'aset_golongan', 'aset_klasifikasi', 'aset_kategori', 'dka_standar_harga'
  ]) as t;

  -- ============ OKR & KPI LEMBAGA (manajer/yayasan) =================
  perform public._pasang_perm_rls(t, 'okr_kpi', 'full') from unnest(array[
    'kpi_lembaga_indikator', 'kpi_lembaga_pengukuran', 'okr_objectives', 'okr_key_results'
  ]) as t;

  -- ============ STRUKTUR (referensi; tulis Yayasan) =================
  perform public._pasang_perm_rls(t, 'struktur', 'write') from unnest(array[
    'schools', 'departments', 'positions'
  ]) as t;

  -- ============ KALENDER LIBUR (select terbuka utk IH) ==============
  perform public._pasang_perm_rls('school_holidays', 'kalender_libur', 'write');

  -- ============ KELAS & TAHUN AJARAN ================================
  perform public._pasang_perm_rls('tahun_ajaran', 'kelas_ta', 'write'); -- referensi
  -- rombel: baca oleh wali kelas / pengajar unit (carve-out); tulis manajer.
  perform public._pasang_perm_rls('rombel', 'kelas_ta', 'full',
    'wali_kelas_employee_id = public.current_employee_id() or public.is_pengajar_of_school(school_id)', null);
  -- riwayat_siswa: baca wali kelas rombel; tulis manajer.
  perform public._pasang_perm_rls('riwayat_siswa', 'kelas_ta', 'full',
    'public.is_wali_kelas_of(rombel_id)', null);

  -- ============ PRESENSI SISWA (wali kelas baca+tulis) ==============
  perform public._pasang_perm_rls('presensi_siswa', 'presensi_siswa', 'full',
    'public.is_wali_kelas_of(rombel_id)', 'public.is_wali_kelas_of(rombel_id)');

  -- ============ NILAI & RAPOR =======================================
  perform public._pasang_perm_rls('mata_pelajaran', 'nilai_rapor', 'write'); -- referensi dropdown
  perform public._pasang_perm_rls('nilai_siswa', 'nilai_rapor', 'full',
    'public.is_wali_kelas_of(rombel_id) or public.is_wali_kelas_of_siswa(siswa_id)',
    'public.is_wali_kelas_of(rombel_id) or public.is_wali_kelas_of_siswa(siswa_id)');
  perform public._pasang_perm_rls('rapor_catatan', 'nilai_rapor', 'full',
    'public.is_wali_kelas_of(rombel_id)', 'public.is_wali_kelas_of(rombel_id)');

  -- ============ PELATIHAN ===========================================
  perform public._pasang_perm_rls('trainings', 'pelatihan', 'write'); -- select terbuka
  perform public._pasang_perm_rls('training_participants', 'pelatihan', 'full',
    'employee_id = public.current_employee_id()', null);

  -- ============ KINERJA (self baca; manajer tulis) ==================
  perform public._pasang_perm_rls('performance_periods', 'kinerja', 'write'); -- referensi
  perform public._pasang_perm_rls('kpi_indicators', 'kinerja', 'write');       -- select terbuka (usulan)
  perform public._pasang_perm_rls('performance_reviews', 'kinerja', 'full',
    'employee_id = public.current_employee_id()', null);
  perform public._pasang_perm_rls('performance_index', 'kinerja', 'full',
    'employee_id = public.current_employee_id()', null);
  perform public._pasang_perm_rls('performance_review_kpi_scores', 'kinerja', 'full',
    'exists (select 1 from public.performance_reviews pr where pr.id = review_id and pr.employee_id = public.current_employee_id())',
    null);

  -- ============ AKADEMIK (guru/pembina/wali carve-out) ==============
  -- Guru pengampu baca miliknya; tulis penugasan/jadwal = manajer.
  perform public._pasang_perm_rls('penugasan_mengajar', 'akademik', 'full',
    'employee_id = public.current_employee_id()', null);
  perform public._pasang_perm_rls('jadwal_pelajaran', 'akademik', 'full',
    'employee_id = public.current_employee_id()', null);
  -- Jurnal & perangkat: guru baca+tulis miliknya.
  perform public._pasang_perm_rls('jurnal_kbm', 'akademik', 'full',
    'employee_id = public.current_employee_id()', 'employee_id = public.current_employee_id()');
  perform public._pasang_perm_rls('perangkat_ajar', 'akademik', 'full',
    'employee_id = public.current_employee_id()', 'employee_id = public.current_employee_id()');
  -- Ekstrakurikuler: pembina baca+tulis miliknya.
  perform public._pasang_perm_rls('ekstrakurikuler', 'akademik', 'full',
    'pembina_employee_id = public.current_employee_id()', 'pembina_employee_id = public.current_employee_id()');
  perform public._pasang_perm_rls('ekskul_peserta', 'akademik', 'full',
    'exists (select 1 from public.ekstrakurikuler e where e.id = ekskul_id and e.pembina_employee_id = public.current_employee_id())',
    'exists (select 1 from public.ekstrakurikuler e where e.id = ekskul_id and e.pembina_employee_id = public.current_employee_id())');
  -- Kurikulum/KKM: dibaca wali kelas unit; tulis manajer.
  perform public._pasang_perm_rls('kurikulum_kkm', 'akademik', 'full',
    'public.is_wali_kelas_of_school(school_id)', null);
  -- Kalender akademik & PPDB: manajer.
  perform public._pasang_perm_rls('kalender_akademik', 'akademik', 'full');
  perform public._pasang_perm_rls('ppdb_pendaftar', 'akademik', 'full');

  -- ============ SISTEM ==============================================
  -- Pengguna & Peran: tulis digerbang 'pengguna'; select biarkan (self+admin).
  perform public._pasang_perm_rls(t, 'pengguna', 'write') from unnest(array[
    'user_roles', 'roles', 'role_permissions', 'modules'
  ]) as t;
  -- Profil: boleh diubah diri sendiri ATAU pemegang izin pengguna.
  perform public._pasang_perm_rls('profiles', 'pengguna', 'write', null,
    'id = auth.uid()');
  -- Notifikasi Email (app_settings): tulis digerbang 'notifikasi'.
  perform public._pasang_perm_rls('app_settings', 'notifikasi', 'write');
  -- Log Aktivitas: baca digerbang 'log' (tulis lewat trigger definer).
  perform public._pasang_perm_rls('activity_log', 'log', 'full');
end $$;

-- Helper hanya dibutuhkan saat migrasi — buang agar tak tertinggal.
drop function if exists public._pasang_perm_rls(text, text, text, text, text);
