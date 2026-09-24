-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: MODUL KEUANGAN (RKAS + Buku Kas).
--
-- Menegakkan has_perm('keuangan', ...) DI SAMPING lingkup & ALUR KERJA
-- yang sudah ada (0049): sekolah menyusun/mengedit saat draft/dikembalikan,
-- Yayasan/Bendahara mengesahkan/mengembalikan. Baris Buku Kas otomatis
-- tetap dijaga trigger buku_kas_guard_auto (tidak diubah di sini).
--
-- Non-destruktif (ganti kebijakan) & idempoten. JALANKAN SETELAH 0057.
-- =====================================================================

-- ---- rkas_anggaran (header, ber-alur kerja) -------------------------
drop policy if exists rkas_anggaran_select on public.rkas_anggaran;
drop policy if exists rkas_anggaran_write_sekolah on public.rkas_anggaran;
drop policy if exists rkas_anggaran_write_yayasan on public.rkas_anggaran;

create policy rkas_anggaran_select on public.rkas_anggaran for select using (
  public.has_perm('keuangan', 'lihat')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
);
create policy rkas_anggaran_insert on public.rkas_anggaran for insert with check (
  public.has_perm('keuangan', 'tambah') and (
    public.is_yayasan_admin() or public.is_bendahara()
    or (public.is_school_manager(school_id) and status in ('draft', 'diajukan'))
  )
);
create policy rkas_anggaran_update on public.rkas_anggaran for update using (
  public.has_perm('keuangan', 'ubah') and (
    public.is_yayasan_admin() or public.is_bendahara()
    or (public.is_school_manager(school_id) and status in ('draft', 'dikembalikan'))
  )
) with check (
  public.has_perm('keuangan', 'ubah') and (
    public.is_yayasan_admin() or public.is_bendahara()
    or (public.is_school_manager(school_id) and status in ('draft', 'diajukan'))
  )
);
create policy rkas_anggaran_delete on public.rkas_anggaran for delete using (
  public.has_perm('keuangan', 'hapus') and (
    public.is_yayasan_admin() or public.is_bendahara()
    or (public.is_school_manager(school_id) and status in ('draft', 'dikembalikan'))
  )
);

-- ---- rkas_pendapatan_item (mengikuti induk) -------------------------
drop policy if exists rkas_pendapatan_item_select on public.rkas_pendapatan_item;
drop policy if exists rkas_pendapatan_item_write on public.rkas_pendapatan_item;

create policy rkas_pendapatan_item_select on public.rkas_pendapatan_item for select using (
  public.has_perm('keuangan', 'lihat') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id
      and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(a.school_id))
  )
);
create policy rkas_pendapatan_item_insert on public.rkas_pendapatan_item for insert with check (
  public.has_perm('keuangan', 'tambah') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
);
create policy rkas_pendapatan_item_update on public.rkas_pendapatan_item for update using (
  public.has_perm('keuangan', 'ubah') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
) with check (
  public.has_perm('keuangan', 'ubah') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
);
create policy rkas_pendapatan_item_delete on public.rkas_pendapatan_item for delete using (
  public.has_perm('keuangan', 'hapus') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
);

-- ---- rkas_belanja_item (mengikuti induk) ----------------------------
drop policy if exists rkas_belanja_item_select on public.rkas_belanja_item;
drop policy if exists rkas_belanja_item_write on public.rkas_belanja_item;

create policy rkas_belanja_item_select on public.rkas_belanja_item for select using (
  public.has_perm('keuangan', 'lihat') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id
      and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(a.school_id))
  )
);
create policy rkas_belanja_item_insert on public.rkas_belanja_item for insert with check (
  public.has_perm('keuangan', 'tambah') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
);
create policy rkas_belanja_item_update on public.rkas_belanja_item for update using (
  public.has_perm('keuangan', 'ubah') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
) with check (
  public.has_perm('keuangan', 'ubah') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
);
create policy rkas_belanja_item_delete on public.rkas_belanja_item for delete using (
  public.has_perm('keuangan', 'hapus') and exists (
    select 1 from public.rkas_anggaran a where a.id = anggaran_id and (
      public.is_yayasan_admin() or public.is_bendahara()
      or (a.status in ('draft', 'dikembalikan') and public.is_school_manager(a.school_id))
    )
  )
);

-- ---- buku_kas_transaksi ---------------------------------------------
drop policy if exists buku_kas_transaksi_select on public.buku_kas_transaksi;
drop policy if exists buku_kas_transaksi_write on public.buku_kas_transaksi;

create policy buku_kas_transaksi_select on public.buku_kas_transaksi for select using (
  public.has_perm('keuangan', 'lihat')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
);
create policy buku_kas_transaksi_insert on public.buku_kas_transaksi for insert with check (
  public.has_perm('keuangan', 'tambah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.is_school_manager(school_id))
);
create policy buku_kas_transaksi_update on public.buku_kas_transaksi for update using (
  public.has_perm('keuangan', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.is_school_manager(school_id))
) with check (
  public.has_perm('keuangan', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.is_school_manager(school_id))
);
create policy buku_kas_transaksi_delete on public.buku_kas_transaksi for delete using (
  public.has_perm('keuangan', 'hapus')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.is_school_manager(school_id))
);
