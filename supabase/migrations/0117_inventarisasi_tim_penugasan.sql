-- 0117: Pisahkan "Penugasan" dari "Jabatan/Unit Asal" pada Tim Inventarisasi.
--
-- jabatan_asal = jabatan struktural asli pegawai (mis. Wakasek Sarpras).
-- penugasan    = tugas dalam kegiatan inventarisasi (mis. "PJ Ruangan: Lab IPA, R. Kelas 7A").

alter table public.inventarisasi_tim add column if not exists penugasan text;

notify pgrst, 'reload schema';
