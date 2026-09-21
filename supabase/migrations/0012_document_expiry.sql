-- Menambahkan kolom tanggal kadaluarsa (opsional) pada dokumen pegawai, agar
-- dokumen seperti sertifikat/izin yang punya masa berlaku bisa dipantau dan
-- dimunculkan peringatannya di Dashboard (H-30) bersama kontrak kerja yang
-- akan berakhir (employment_contracts.tanggal_selesai sudah ada sejak awal).
-- Non-destruktif: kolom baru nullable, tidak mengubah data/kolom yang ada.

alter table public.employee_documents
  add column if not exists tanggal_kadaluarsa date;

comment on column public.employee_documents.tanggal_kadaluarsa is
  'Tanggal kadaluarsa dokumen (opsional) — mis. sertifikat, SIM, izin praktik. Dipakai untuk peringatan H-30 di Dashboard.';
