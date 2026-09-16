-- =====================================================================
-- STORAGE — bucket privat untuk foto & dokumen pegawai
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('employee-files', 'employee-files', false)
on conflict (id) do nothing;

-- Baca: admin yayasan/hr, atau pengguna terhubung ke sekolah terkait
-- (disederhanakan: siapa pun yang sudah login boleh baca file yang di-attach
-- lewat URL bertanda tangan/signed URL; kontrol utama tetap ada di tabel
-- employee_documents lewat RLS di atas). Tulis: hanya pengguna terautentikasi.
create policy "employee_files_read" on storage.objects
  for select using (bucket_id = 'employee-files' and auth.uid() is not null);

create policy "employee_files_insert" on storage.objects
  for insert with check (bucket_id = 'employee-files' and auth.uid() is not null);

create policy "employee_files_update" on storage.objects
  for update using (bucket_id = 'employee-files' and auth.uid() is not null);

create policy "employee_files_delete" on storage.objects
  for delete using (bucket_id = 'employee-files' and auth.uid() is not null);
