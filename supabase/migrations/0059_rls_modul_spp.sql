-- =====================================================================
-- FASE 2 — PENEGAKAN RLS PER-AKSI: MODUL SPP.
--
-- spp_tarif, spp_tagihan, spp_pembayaran ditegakkan per-aksi
-- (has_perm('spp', ...)) di samping lingkup unit/bendahara/yayasan yang
-- sudah ada (0024). SPP pembayaran yang tercatat memicu posting Buku Kas
-- otomatis (trigger 0049, security definer) — tidak terpengaruh RLS ini.
--
-- Non-destruktif (ganti kebijakan) & idempoten. JALANKAN SETELAH 0058.
-- =====================================================================

-- ---- spp_tarif ------------------------------------------------------
drop policy if exists spp_tarif_select on public.spp_tarif;
drop policy if exists spp_tarif_write on public.spp_tarif;

create policy spp_tarif_select on public.spp_tarif for select using (
  public.has_perm('spp', 'lihat')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
);
create policy spp_tarif_insert on public.spp_tarif for insert with check (
  public.has_perm('spp', 'tambah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
);
create policy spp_tarif_update on public.spp_tarif for update using (
  public.has_perm('spp', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
) with check (
  public.has_perm('spp', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
);
create policy spp_tarif_delete on public.spp_tarif for delete using (
  public.has_perm('spp', 'hapus')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id))
);

-- ---- spp_tagihan ----------------------------------------------------
drop policy if exists spp_tagihan_select on public.spp_tagihan;
drop policy if exists spp_tagihan_write on public.spp_tagihan;

create policy spp_tagihan_select on public.spp_tagihan for select using (
  public.has_perm('spp', 'lihat')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
);
create policy spp_tagihan_insert on public.spp_tagihan for insert with check (
  public.has_perm('spp', 'tambah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
);
create policy spp_tagihan_update on public.spp_tagihan for update using (
  public.has_perm('spp', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
) with check (
  public.has_perm('spp', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
);
create policy spp_tagihan_delete on public.spp_tagihan for delete using (
  public.has_perm('spp', 'hapus')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.siswa_school_id(siswa_id)))
);

-- ---- spp_pembayaran -------------------------------------------------
drop policy if exists spp_pembayaran_select on public.spp_pembayaran;
drop policy if exists spp_pembayaran_write on public.spp_pembayaran;

create policy spp_pembayaran_select on public.spp_pembayaran for select using (
  public.has_perm('spp', 'lihat')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)))
);
create policy spp_pembayaran_insert on public.spp_pembayaran for insert with check (
  public.has_perm('spp', 'tambah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)))
);
create policy spp_pembayaran_update on public.spp_pembayaran for update using (
  public.has_perm('spp', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)))
) with check (
  public.has_perm('spp', 'ubah')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)))
);
create policy spp_pembayaran_delete on public.spp_pembayaran for delete using (
  public.has_perm('spp', 'hapus')
  and (public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.spp_tagihan_school_id(tagihan_id)))
);
