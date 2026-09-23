-- =====================================================================
-- INTEGRASI JP MENGAJAR (Academic) → BEBAN KERJA (Kepegawaian).
--
-- Total jam mengajar (JTM/JP per minggu) dari penugasan_mengajar pada
-- tahun ajaran AKTIF otomatis mengisi employee_beban_kerja.jp_mengajar,
-- sehingga langsung terhitung di modul Beban Kerja. Diperbarui otomatis
-- lewat trigger setiap penugasan ditamb/ubah/hapus.
--
-- Catatan semester: beban kerja adalah angka per-minggu tunggal; agar
-- tidak dobel saat Ganjil & Genap sama-sama terisi, dipakai NILAI
-- TERBESAR di antara total semester (biasanya sama tiap semester).
--
-- Idempoten & non-destruktif. JALANKAN SETELAH 0046.
-- =====================================================================

create or replace function public.hitung_jp_mengajar_aktif(p_employee_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(greatest(
      coalesce(sum(pm.jam_per_minggu) filter (where pm.semester = 'Ganjil'), 0),
      coalesce(sum(pm.jam_per_minggu) filter (where pm.semester = 'Genap'), 0)
    ), 0)
  from public.penugasan_mengajar pm
  join public.tahun_ajaran ta on ta.id = pm.tahun_ajaran_id and ta.status = 'aktif'
  where pm.employee_id = p_employee_id;
$$;

-- Sinkronkan jp_mengajar seorang guru ke employee_beban_kerja.
create or replace function public.terapkan_jp_mengajar(p_employee_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_employee_id is null then return; end if;
  insert into public.employee_beban_kerja (employee_id, jp_mengajar, jam_ketatausahaan, updated_at)
  values (p_employee_id, public.hitung_jp_mengajar_aktif(p_employee_id), 0, now())
  on conflict (employee_id) do update set jp_mengajar = excluded.jp_mengajar, updated_at = now();
end;
$$;

create or replace function public.penugasan_sync_jp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.terapkan_jp_mengajar(coalesce(new.employee_id, old.employee_id));
  -- Bila penugasan dipindah ke guru lain, perbarui guru lama juga.
  if tg_op = 'UPDATE' and old.employee_id is distinct from new.employee_id then
    perform public.terapkan_jp_mengajar(old.employee_id);
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists penugasan_sync_jp_trg on public.penugasan_mengajar;
create trigger penugasan_sync_jp_trg
  after insert or update or delete on public.penugasan_mengajar
  for each row execute function public.penugasan_sync_jp();

-- Backfill: samakan jp_mengajar semua guru yang sudah punya penugasan aktif.
insert into public.employee_beban_kerja (employee_id, jp_mengajar, jam_ketatausahaan, updated_at)
select e.id, public.hitung_jp_mengajar_aktif(e.id), 0, now()
from public.employees e
where exists (
  select 1 from public.penugasan_mengajar pm
  join public.tahun_ajaran ta on ta.id = pm.tahun_ajaran_id and ta.status = 'aktif'
  where pm.employee_id = e.id
)
on conflict (employee_id) do update set jp_mengajar = excluded.jp_mengajar, updated_at = now();
