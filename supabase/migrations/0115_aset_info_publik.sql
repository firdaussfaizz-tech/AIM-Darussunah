-- 0115: Info aset publik untuk QR label (dibuka kamera HP tanpa login).
-- Mengembalikan field AMAN saja (tanpa nilai/sumber dana). SECURITY DEFINER agar
-- bisa dibaca anon, tapi hanya lewat fungsi ini (RLS tabel tetap berlaku untuk akses lain).
create or replace function public.aset_info_publik(p_kode text)
returns table (
  nama text, kode_aset text, kode_lokasi text, merk_tipe text,
  satuan text, jumlah numeric, kondisi text, verif_status text,
  ruangan text, unit text, jenjang text, golongan text, tahun_perolehan int
)
language sql security definer set search_path = public stable as $$
  select a.nama, a.kode_aset, a.kode_lokasi, a.merk_tipe,
    a.satuan, a.jumlah::numeric, a.kondisi::text, a.verif_status::text,
    r.nama, s.nama, s.jenjang, k.uraian, a.tahun_perolehan
  from public.aset a
  left join public.ruangan r on r.id = a.ruangan_id
  left join public.schools s on s.id = a.school_id
  left join public.aset_klasifikasi k on k.id = a.klasifikasi_id
  where upper(a.kode_aset) = upper(btrim(p_kode)) and a.status = 'aktif'
  limit 1
$$;

grant execute on function public.aset_info_publik(text) to anon, authenticated;

notify pgrst, 'reload schema';
