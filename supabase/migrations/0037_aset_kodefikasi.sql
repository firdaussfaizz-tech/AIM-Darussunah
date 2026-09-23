-- =====================================================================
-- MODUL ASET — Revisi Tahap 1: KODEFIKASI RESMI + AUTO-GENERATE KODE.
--
-- Mengganti kategori sederhana (0036) dengan skema kode resmi sesuai
-- Juknis Manajemen Aset YPI Darussunah:
--   * Kode Aset  (Permendagri): golongan.bidang.kelompok.subkelompok.
--     subsubkelompok . NOMOR REGISTER(4) — mis. 02.05.02.01.03.0003
--   * Kode Lokasi: kepemilikan(05=Yayasan).lembaga.unit_kerja.ruangan.
--     tahun — mis. 05.02.01.01.2024
-- Kode DIBUAT OTOMATIS oleh trigger saat aset disimpan, sehingga pegawai
-- tidak perlu mengetik kode manual (permintaan pengguna).
--
-- JALANKAN SETELAH 0036. Aman dijalankan ulang (idempoten).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Golongan aset (6) + kebijakan penyusutan per golongan.
-- ---------------------------------------------------------------------
create table if not exists public.aset_golongan (
  kode text primary key,
  nama text not null,
  umur_ekonomis_bulan int check (umur_ekonomis_bulan is null or umur_ekonomis_bulan > 0),
  nilai_residu_persen numeric(5,2) not null default 0 check (nilai_residu_persen >= 0 and nilai_residu_persen <= 100)
);

insert into public.aset_golongan (kode, nama, umur_ekonomis_bulan, nilai_residu_persen) values
  ('01', 'Tanah', null, 0),
  ('02', 'Peralatan & Mesin', 48, 10),
  ('03', 'Gedung & Bangunan', 600, 0),
  ('04', 'Jalan, Irigasi & Jaringan', 240, 0),
  ('05', 'Aset Tetap Lainnya', 48, 0),
  ('06', 'Konstruksi dalam Pengerjaan', null, 0)
on conflict (kode) do nothing;

alter table public.aset_golongan enable row level security;
drop policy if exists aset_golongan_select on public.aset_golongan;
create policy aset_golongan_select on public.aset_golongan for select using (auth.uid() is not null);
drop policy if exists aset_golongan_write on public.aset_golongan;
create policy aset_golongan_write on public.aset_golongan for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- ---------------------------------------------------------------------
-- 2. Klasifikasi aset (Permendagri) — dari Tabel Kode Aset.
-- ---------------------------------------------------------------------
create table if not exists public.aset_klasifikasi (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,      -- mis. '02.05.02.01.03'
  golongan text not null,         -- 2 digit pertama (mengacu aset_golongan.kode)
  level int not null,             -- kedalaman (1..5)
  uraian text not null,
  created_at timestamptz not null default now()
);
create index if not exists aset_klasifikasi_golongan_idx on public.aset_klasifikasi (golongan);

alter table public.aset_klasifikasi enable row level security;
drop policy if exists aset_klasifikasi_select on public.aset_klasifikasi;
create policy aset_klasifikasi_select on public.aset_klasifikasi for select using (auth.uid() is not null);
drop policy if exists aset_klasifikasi_write on public.aset_klasifikasi;
create policy aset_klasifikasi_write on public.aset_klasifikasi for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- Seed 243 baris klasifikasi (dari Tabel Kode Aset yang diunggah).
insert into public.aset_klasifikasi (kode, golongan, level, uraian) values
('01','01',1,'Golongan Tanah'),
('02','02',1,'Golongan Peralatan & Mesin'),
('03','03',1,'Golongan Gedung & Bangunan'),
('04','04',1,'Golongan Jalan, Irigasi, dan Jaringan'),
('05','05',1,'Aset Tetap Lainnya'),
('06','06',1,'Konstruksi dalam Pengerjaan'),
('01','01',1,'GOLONGAN TANAH'),
('01.01','01',2,'TANAH'),
('01.01.01','01',3,'TANAH EMPLASMEN'),
('01.01.02','01',3,'TANAH PERKEBUNAN'),
('01.01.02.01','01',4,'Perkebunan'),
('01.01.02.02','01',4,'Hutan Buatan'),
('01.01.03','01',3,'KOLAM IKAN'),
('01.01.03.01','01',4,'Air Tawar'),
('01.01.04','01',3,'TANAH UNTUK BANGUNAN'),
('01.01.04.01','01',4,'Tanah Bangunan Sekolah'),
('01.01.04.02','01',4,'Tanah Bangunan Tempat Tinggal'),
('01.01.04.03','01',4,'Tanah Bangunan Usaha'),
('01.01.04.04','01',4,'Tanah Kosong'),
('01.01.05','01',3,'TANAH UNTUK BANGUNAN BUKAN GEDUNG'),
('01.01.05.01','01',4,'Tanah Lapangan Olahraga'),
('01.01.05.02','01',4,'Tanah Lapangan Parkir'),
('02','02',1,'GOLONGAN PERALATAN & MESIN'),
('02.02','02',2,'ALAT-ALAT BESAR'),
('02.02.01','02',3,'ALAT-ALAT BANTU'),
('02.02.01.01','02',4,'Electric Generating Set'),
('02.02.01.02','02',4,'Mesin Bor'),
('02.02.01.03','02',4,'Unit Pemeliharaan Lapangan'),
('02.02.01.04','02',4,'Alat Penarik'),
('02.03','02',2,'ALAT-ALAT ANGKUTAN'),
('02.03.01','02',3,'ALAT ANGKUTAN BERMOTOR'),
('02.03.01.01','02',4,'Kendaraan Dinas Perorangan'),
('02.03.01.01.01','02',5,'MPV'),
('02.03.01.02','02',4,'Kendaraan Dinas Penumpang'),
('02.03.01.02.01','02',5,'Mini Bus (Hiace)'),
('02.03.01.03','02',4,'Kendaraan Dinas Angkutan Barang'),
('02.03.01.03.01','02',5,'Pick Up'),
('02.04','02',2,'ALAT BENGKEL DAN ALAT UKUR'),
('02.04.01','02',3,'ALAT BENGKEL BERMESIN'),
('02.04.01.01','02',4,'Perkakas Bengkel Listrik'),
('02.04.01.02','02',4,'Perkakas Bengkel Kayu'),
('02.04.01.03','02',4,'Perkakas Bengkel Service'),
('02.04.01.04','02',4,'Peralatan Las'),
('02.04.02','02',3,'ALAT BENGKEL TAK BERMESIN'),
('02.04.02.01','02',4,'Perkakas Bengkel Listrik'),
('02.04.02.02','02',4,'Perkakas Bengkel Kayu'),
('02.04.02.03','02',4,'Perkakas Bengkel Service'),
('02.04.02.04','02',4,'Peralatan Tukang Besi'),
('02.04.02.05','02',4,'Perkakas Standar'),
('02.04.02.06','02',4,'Perkakas Khusus'),
('02.04.03','02',3,'ALAT UKUR'),
('02.04.03.01','02',4,'Alat Ukur Universal'),
('02.04.03.02','02',4,'Alat Ukur/Test Intelegensia'),
('02.04.03.03','02',4,'Alat Ukur/Tests Klinis lain'),
('02.04.03.04','02',4,'Akat Ukur/Pembanding'),
('02.04.03.05','02',4,'Alat Timbangan/Blora'),
('02.04.03.06','02',4,'Anak Timbangan/Biasa'),
('02.05','02',2,'ALAT KANTOR DAN RUMAH TANGGA'),
('02.05.01','02',3,'ALAT KANTOR'),
('02.05.01.01','02',4,'Mesin Tik'),
('02.05.01.02','02',4,'Mesin Hitung'),
('02.05.01.03','02',4,'Alat Penyimpanan Perlengkapan Kantor'),
('02.05.01.03.01','02',5,'Lemari Arsip'),
('02.05.01.03.02','02',5,'Rak Buku/Dokumen'),
('02.05.01.03.03','02',5,'Lemari Penyimpanan'),
('02.05.01.03.04','02',5,'Filling Cabinet'),
('02.05.01.03.05','02',5,'Organizer Desk Tray'),
('02.05.01.03.06','02',5,'Locker Kantor'),
('02.05.01.03.07','02',5,'Toolbox Stationery'),
('02.05.01.03.08','02',5,'Vertical File Holder'),
('02.05.01.03.09','02',5,'Binder & Folder'),
('02.05.01.03.10','02',5,'Rak Dinding'),
('02.05.01.03.11','02',5,'Peti Uang'),
('02.05.01.03.12','02',5,'Map Ordner'),
('02.05.01.04','02',4,'Alat Kantor Lainnya'),
('02.05.01.04.01','02',5,'Stopmap'),
('02.05.01.04.02','02',5,'Perforator'),
('02.05.01.04.03','02',5,'Paper Shredder'),
('02.05.01.04.04','02',5,'Meja Kantor'),
('02.05.01.04.05','02',5,'Kursi Kantor'),
('02.05.01.04.06','02',5,'Scanner'),
('02.05.01.04.07','02',5,'Papan Nama Instansi'),
('02.05.01.04.08','02',5,'Papan Pengumuman'),
('02.05.01.04.09','02',5,'Papan Tulis'),
('02.05.01.04.10','02',5,'Switch'),
('02.05.01.04.11','02',5,'Proyektor'),
('02.05.01.04.12','02',5,'Stapler'),
('02.05.01.04.13','02',5,'Kabel Power'),
('02.05.01.04.14','02',5,'Highlighter/Stabilo'),
('02.05.01.04.15','02',5,'Paper Clip'),
('02.05.01.04.16','02',5,'Map Folder'),
('02.05.01.04.17','02',5,'Binder Clip'),
('02.05.01.04.18','02',5,'Meja Rapat'),
('02.05.01.04.19','02',5,'Sofa Ruang Tunggu'),
('02.05.01.04.20','02',5,'Kalkulator'),
('02.05.01.04.21','02',5,'flipchart'),
('02.05.01.04.22','02',5,'Cutter'),
('02.05.01.04.23','02',5,'Pulpen'),
('02.05.01.04.24','02',5,'Gunting'),
('02.05.01.04.25','02',5,'Labeler'),
('02.05.01.04.26','02',5,'Tinta printer'),
('02.05.01.04.27','02',5,'Cable organizer'),
('02.05.01.04.28','02',5,'Mikrofon'),
('02.05.01.04.29','02',5,'Alat perekat'),
('02.05.01.04.30','02',5,'Mesin pemotong kertas'),
('02.05.01.04.31','02',5,'Harddrive (HDD/SSD)'),
('02.05.01.04.32','02',5,'Jangka'),
('02.05.01.04.33','02',5,'Corrector'),
('02.05.01.04.34','02',5,'Kertas A4'),
('02.05.01.04.99','02',5,'Lain-lain'),
('02.05.02','02',3,'ALAT RUMAH TANGGA'),
('02.05.02.01.01','02',5,'Meubilair'),
('02.05.02.01.02','02',5,'Lemari Kayu'),
('02.05.02.01.03','02',5,'Lemari Besi'),
('02.05.02.01.04','02',5,'Rak Kayu'),
('02.05.02.01.05','02',5,'Rak Besi'),
('02.05.02.01.06','02',5,'Meja Besi'),
('02.05.02.01.07','02',5,'Meja Kayu'),
('02.05.02.01.08','02',5,'Kursi Besi'),
('02.05.02.01.09','02',5,'Kursi Kayu/Rotan/Bambu'),
('02.05.02.01.10','02',5,'Meja rapat'),
('02.05.02.01.11','02',5,'Meja Tulis'),
('02.05.02.01.12','02',5,'Meja Makan'),
('02.05.02.01.13','02',5,'Meja Telepon'),
('02.05.02.01.14','02',5,'Podium'),
('02.05.02.01.15','02',5,'Meja siswa'),
('02.05.02.01.16','02',5,'Meja Resepsionis'),
('02.05.02.01.17','02',5,'Kursi Rapat'),
('02.05.02.01.18','02',5,'Kursi Tamu'),
('02.05.02.01.19','02',5,'Kursi Putar'),
('02.05.02.01.20','02',5,'Kursi siswa'),
('02.05.02.01.21','02',5,'Meja Guru'),
('02.05.02.01.22','02',5,'Kursi Guru'),
('02.05.02.01.23','02',5,'Kursi Lipat'),
('02.05.02.01.24','02',5,'Meja Komputer'),
('02.05.02.01.25','02',5,'Alat Pengelap'),
('02.05.02.01.26','02',5,'Seprai'),
('02.05.02.01.27','02',5,'Tikar'),
('02.05.02.01.28','02',5,'karpet'),
('02.05.02.01.29','02',5,'Bangku tunggu'),
('02.05.02.01.30','02',5,'kasur'),
('02.05.02.01.31','02',5,'bantal'),
('02.05.02.01.32','02',5,'guling'),
('02.05.02.01.33','02',5,'selimut'),
('02.05.02.01.34','02',5,'tenda'),
('02.05.02.01.35','02',5,'ranjang'),
('02.05.02.01.36','02',5,'lemari buku'),
('02.05.02.01.37','02',5,'lemari pakaian'),
('02.05.02.01.99','02',5,'Lain-lain'),
('02.05.02.02','02',4,'Alat Rumah Tangga Pengukur Waktu'),
('02.05.02.03','02',4,'Alat Rumah Tangga Pembersih'),
('02.05.02.03.01','02',5,'Vacum Cleaner'),
('02.05.02.03.02','02',5,'Alat Pel'),
('02.05.02.03.03','02',5,'Mesin Potong Rumput'),
('02.05.02.03.04','02',5,'Mesin Cuci'),
('02.05.02.03.99','02',5,'Lain-lain'),
('02.05.02.04','02',4,'Alat Pendingin'),
('02.05.02.04.01','02',5,'lemari es'),
('02.05.02.04.02','02',5,'ac sentral'),
('02.05.02.04.03','02',5,'ac unit'),
('02.05.02.04.04','02',5,'ac split'),
('02.05.02.04.05','02',5,'power conditioner'),
('02.05.02.04.06','02',5,'kipas angin'),
('02.05.02.04.07','02',5,'exhause fan'),
('02.05.02.04.08','02',5,'cold storage'),
('02.05.02.04.09','02',5,'frezzer'),
('02.05.02.04.10','02',5,'chiller'),
('02.05.02.04.11','02',5,'up right chiller/frezzer'),
('02.05.02.04.12','02',5,'cold room storage'),
('02.05.02.04.99','02',5,'Lain-lain'),
('02.05.02.05','02',4,'Alat Dapur'),
('02.05.02.05.01','02',5,'Kompor Listrik'),
('02.05.02.05.02','02',5,'Kompor gas'),
('02.05.02.05.03','02',5,'teko listrik'),
('02.05.02.05.04','02',5,'tabung gas'),
('02.05.02.05.05','02',5,'baskom air'),
('02.05.02.05.06','02',5,'panci'),
('02.05.02.05.07','02',5,'alat penanak nasi'),
('02.05.02.05.08','02',5,'mesin parutan'),
('02.05.02.05.99','02',5,'Lain-lain'),
('02.05.02.06','02',4,'Alat Rumah Tangga Lainnya'),
('02.05.02.06.01','02',5,'Alat Pemanas'),
('02.05.02.06.02','02',5,'Radio'),
('02.05.02.06.03','02',5,'televisi'),
('02.05.02.06.04','02',5,'amplifier'),
('02.05.02.06.05','02',5,'equalizer'),
('02.05.02.06.06','02',5,'loudspeaker'),
('02.05.02.06.07','02',5,'sound system'),
('02.05.02.06.08','02',5,'megaphone'),
('02.05.02.06.09','02',5,'microphone'),
('02.05.02.06.10','02',5,'microphone floor stand'),
('02.05.02.06.11','02',5,'microphone table stand'),
('02.05.02.06.12','02',5,'unit power supply'),
('02.05.02.06.13','02',5,'timbangan orang'),
('02.05.02.06.14','02',5,'timbangan barang'),
('02.05.02.06.15','02',5,'alat hiasan'),
('02.05.02.06.16','02',5,'lambang garuda'),
('02.05.02.06.17','02',5,'gambar presiden/wakil presiden'),
('02.05.02.06.18','02',5,'tiang bendera'),
('02.05.02.06.19','02',5,'water filter'),
('02.05.02.06.20','02',5,'dispencer'),
('02.05.02.06.21','02',5,'mimbar/podium'),
('02.05.02.06.22','02',5,'handy cam'),
('02.05.02.06.99','02',5,'Lain-lain'),
('02.05.02.07','02',4,'Alat Pemadam Kebakaran'),
('02.05.02.07.01','02',5,'alat pemadam portable'),
('02.05.02.07.02','02',5,'alarm kebakaran'),
('02.05.02.07.03','02',5,'masker oksigen'),
('02.05.02.07.04','02',5,'masker gas'),
('02.05.02.07.05','02',5,'pakaian panas'),
('02.05.02.07.99','02',5,'Lain-lain'),
('02.05.03','02',3,'KOMPUTER'),
('02.05.03.01','02',4,'komputer unit/jaringan'),
('02.05.03.01.01','02',5,'mainframe'),
('02.05.03.01.02','02',5,'mini komputer'),
('02.05.03.01.03','02',5,'LAN'),
('02.05.03.01.04','02',5,'Internet'),
('02.05.03.01.99','02',5,'Lain-lain'),
('02.05.03.02','02',4,'Personal Komputer'),
('02.05.03.02.01','02',5,'PC Unit'),
('02.05.03.02.02','02',5,'Laptop'),
('02.05.03.02.03','02',5,'Macbook'),
('02.05.03.02.99','02',5,'Lain-lain'),
('02.05.03.03','02',4,'Peralatan Personal Komputer'),
('02.05.03.03.01','02',5,'CPU'),
('02.05.03.03.02','02',5,'Monitor'),
('02.05.03.03.03','02',5,'Printer'),
('02.05.03.03.04','02',5,'Scanner'),
('02.05.03.03.05','02',5,'External storage'),
('02.05.03.03.06','02',5,'keyboard'),
('02.05.03.03.07','02',5,'mouse'),
('02.05.03.03.08','02',5,'mouse pad'),
('02.05.03.03.99','02',5,'Lain-lain'),
('02.05.03.04','02',4,'Peralatan Jaringan'),
('02.05.03.04.01','02',5,'Server'),
('02.05.03.04.02','02',5,'Router'),
('02.05.03.04.03','02',5,'Wifi'),
('02.05.03.04.04','02',5,'Hub'),
('02.05.03.04.05','02',5,'Modem'),
('02.05.03.04.99','02',5,'Lain-lain'),
('02.06','02',2,'ALAT PEMBELAJARAN'),
('02.06.01','02',3,'ALAT PERAGA/PRAKTEK'),
('02.06.01.01','02',4,'Mapel: Bahasa Indonesia')
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 3. Kode lembaga pada schools (digit 3-4 Kode Lokasi).
-- ---------------------------------------------------------------------
alter table public.schools add column if not exists kode_lembaga text;
-- Set default dari jenjang bila belum diisi (SD=01, SMP=02, SMA=03,
-- Pesantren/boarding=04). Yayasan bisa membakukan lebih lanjut.
update public.schools set kode_lembaga = case
  when kode_lembaga is not null then kode_lembaga
  when lower(jenjang) = 'sd' then '01'
  when lower(jenjang) = 'smp' then '02'
  when lower(jenjang) = 'sma' then '03'
  when lower(jenjang) like 'pesantren%' or lower(jenjang) like 'boarding%' then '04'
  else '00'
end
where kode_lembaga is null;

-- ---------------------------------------------------------------------
-- 4. Ruangan: kode unit kerja, kode ruangan, dan PIC (permintaan user).
-- ---------------------------------------------------------------------
alter table public.ruangan
  add column if not exists kode_unit_kerja text,
  add column if not exists kode_ruangan text,
  add column if not exists pic_nama text,
  add column if not exists pic_employee_id uuid references public.employees(id) on delete set null;

-- ---------------------------------------------------------------------
-- 5. Aset: kolom kodefikasi baru + register + kepemilikan; lepas kategori lama.
-- ---------------------------------------------------------------------
alter table public.aset
  add column if not exists klasifikasi_id uuid references public.aset_klasifikasi(id),
  add column if not exists kepemilikan text not null default '05',
  add column if not exists nomor_register int,
  add column if not exists kode_lokasi text;
-- kode_aset sudah ada (0036) sebagai teks manual; kini diisi otomatis trigger.

-- Lepaskan ketergantungan kategori lama (0036) — belum dipakai data nyata.
alter table public.aset drop column if exists kategori_id;
drop table if exists public.aset_kategori;

create index if not exists aset_klasifikasi_id_idx on public.aset (klasifikasi_id);

-- ---------------------------------------------------------------------
-- 6. Trigger auto-generate Kode Aset & Kode Lokasi + Nomor Register.
--    Register berjalan per (unit sekolah, klasifikasi) — "lemari besi
--    ke-1, ke-2, ..." di unit ybs. Pegawai tak perlu mengetik kode.
-- ---------------------------------------------------------------------
create or replace function public.aset_generate_kode()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kode_klas text;
  v_lembaga text;
  v_unitkerja text;
  v_ruang text;
  v_tahun text;
begin
  -- Nomor register per unit + klasifikasi (bila belum diisi / klasifikasi berubah).
  if new.klasifikasi_id is not null and (new.nomor_register is null
      or tg_op = 'INSERT'
      or new.klasifikasi_id is distinct from old.klasifikasi_id
      or new.school_id is distinct from old.school_id) then
    select coalesce(max(nomor_register), 0) + 1 into new.nomor_register
    from public.aset
    where school_id = new.school_id and klasifikasi_id = new.klasifikasi_id and id <> new.id;
  end if;

  -- Kode Aset = kode klasifikasi + nomor register (4 digit).
  if new.klasifikasi_id is not null then
    select kode into v_kode_klas from public.aset_klasifikasi where id = new.klasifikasi_id;
    new.kode_aset := v_kode_klas || '.' || lpad(coalesce(new.nomor_register, 0)::text, 4, '0');
  end if;

  -- Kode Lokasi = kepemilikan.lembaga.unit_kerja.ruangan.tahun.
  select coalesce(kode_lembaga, '00') into v_lembaga from public.schools where id = new.school_id;
  if new.ruangan_id is not null then
    select coalesce(kode_unit_kerja, '00'), coalesce(kode_ruangan, '00')
      into v_unitkerja, v_ruang from public.ruangan where id = new.ruangan_id;
  else
    v_unitkerja := '00'; v_ruang := '00';
  end if;
  v_tahun := coalesce(new.tahun_perolehan::text, to_char(now(), 'YYYY'));
  new.kode_lokasi := coalesce(new.kepemilikan, '05') || '.' || coalesce(v_lembaga, '00') || '.'
                     || coalesce(v_unitkerja, '00') || '.' || coalesce(v_ruang, '00') || '.' || v_tahun;
  return new;
end;
$$;

drop trigger if exists aset_generate_kode_trg on public.aset;
create trigger aset_generate_kode_trg
  before insert or update on public.aset
  for each row execute function public.aset_generate_kode();

-- =====================================================================
-- TAHAP 2 — PERENCANAAN PENGADAAN ASET (DKA / Daftar Kebutuhan Aset).
--
-- Mengangkat SOP Perencanaan & Penganggaran Aset YPI Darussunah
-- (Lampiran FM-01 Pengadaan) ke dalam alur digital, MEMAKAI ULANG pola
-- usulan-persetujuan yang sudah dipakai KPI Lembaga/OKR (migrasi 0031/
-- 0032): satuan pendidikan MENYUSUN & MENGAJUKAN, Yayasan MEMUTUSKAN
-- (mengesahkan / mengembalikan untuk revisi).
--
-- Tabel:
--   1. dka_standar_harga  — Standar Harga (referensi harga maksimal),
--        dikelola Yayasan agar seragam. Dipakai memvalidasi harga usulan:
--        harga_satuan > standar → butuh justifikasi + persetujuan Ketua.
--   2. dka_usulan         — header usulan per UNIT + TAHUN ANGGARAN,
--        dengan status draft → diajukan → disahkan / dikembalikan.
--   3. dka_usulan_item    — baris kebutuhan (FM-01): klasifikasi (kode aset
--        otomatis), spesifikasi, alasan, cara pengadaan, jumlah maksimal
--        vs tersedia → RIIL (generated), jumlah pengajuan, harga, dsb.
--
--   Jumlah Riil Kebutuhan  = maks(Jumlah Maksimal − Jumlah Tersedia, 0)
--   Jumlah Harga           = Jumlah Pengajuan × Harga Satuan
--   (keduanya kolom GENERATED — konsisten & tak bisa salah hitung).
--   "Jumlah Aset Tersedia" bisa ditarik dari Buku Inventaris (Tahap 1)
--   lewat RPC dka_hitung_tersedia() — integrasi DKA ← Inventaris.
--
-- Aman dijalankan ulang (idempoten). Bagian dari file 0037 yang sama.
-- =====================================================================

-- Status usulan DKA — samakan kosakata dgn workflow lain (0032).
do $$ begin
  create type public.dka_status_enum as enum ('draft', 'diajukan', 'disahkan', 'dikembalikan');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 1. Standar Harga (referensi, dikelola Yayasan).
-- ---------------------------------------------------------------------
create table if not exists public.dka_standar_harga (
  id uuid primary key default gen_random_uuid(),
  tahun int not null,
  klasifikasi_id uuid references public.aset_klasifikasi(id) on delete set null,
  nama_aset text not null,
  satuan text not null default 'unit',
  harga_maksimal numeric(16,2) not null default 0 check (harga_maksimal >= 0),
  sumber_rujukan text,
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists dka_standar_harga_tahun_idx on public.dka_standar_harga (tahun);
create index if not exists dka_standar_harga_klas_idx on public.dka_standar_harga (klasifikasi_id);

alter table public.dka_standar_harga enable row level security;
drop policy if exists dka_standar_harga_select on public.dka_standar_harga;
create policy dka_standar_harga_select on public.dka_standar_harga for select using (auth.uid() is not null);
drop policy if exists dka_standar_harga_write on public.dka_standar_harga;
create policy dka_standar_harga_write on public.dka_standar_harga for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- ---------------------------------------------------------------------
-- 2. Usulan DKA (header) — per unit + tahun anggaran.
-- ---------------------------------------------------------------------
create table if not exists public.dka_usulan (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun int not null,
  judul text,
  status public.dka_status_enum not null default 'draft',
  catatan_yayasan text,
  diajukan_by uuid references public.employees(id),
  diajukan_by_user_id uuid references auth.users(id),
  diajukan_at timestamptz,
  diputuskan_by uuid references public.employees(id),
  diputuskan_by_user_id uuid references auth.users(id),
  diputuskan_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, tahun)
);
create index if not exists dka_usulan_school_idx on public.dka_usulan (school_id);
create index if not exists dka_usulan_tahun_idx on public.dka_usulan (tahun);

-- Catat aktor pengaju (Kepala/Admin Sekolah) & pemutus (Yayasan).
create or replace function public.dka_usulan_set_workflow_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'diajukan' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.diajukan_by := public.current_employee_id();
    new.diajukan_by_user_id := auth.uid();
    new.diajukan_at := now();
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('disahkan', 'dikembalikan') then
    new.diputuskan_by := public.current_employee_id();
    new.diputuskan_by_user_id := auth.uid();
    new.diputuskan_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists dka_usulan_workflow_actor on public.dka_usulan;
create trigger dka_usulan_workflow_actor
  before insert or update on public.dka_usulan
  for each row execute function public.dka_usulan_set_workflow_actor();

create or replace function public.dka_usulan_diajukan_nama(u public.dka_usulan)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nama from public.employees where id = u.diajukan_by),
    (select coalesce(full_name, email) from public.profiles where id = u.diajukan_by_user_id)
  );
$$;

alter table public.dka_usulan enable row level security;

-- Terlihat oleh Yayasan & siapa pun yang punya akses ke sekolah ybs.
drop policy if exists dka_usulan_select on public.dka_usulan;
create policy dka_usulan_select on public.dka_usulan for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);

-- Sekolah (Admin/Kepala Sekolah) menyusun/mengedit saat draft/dikembalikan
-- & mengajukan; TIDAK boleh mengesahkan sendiri. Sekali disahkan, using
-- sekolah tak lagi cocok → usulan terkunci dari sisi sekolah.
drop policy if exists dka_usulan_write_sekolah on public.dka_usulan;
create policy dka_usulan_write_sekolah on public.dka_usulan for all using (
  status in ('draft', 'dikembalikan') and public.is_school_manager(school_id)
) with check (
  status in ('draft', 'diajukan') and public.is_school_manager(school_id)
);

-- Yayasan: akses penuh (mengesahkan / mengembalikan usulan unit mana pun).
drop policy if exists dka_usulan_write_yayasan on public.dka_usulan;
create policy dka_usulan_write_yayasan on public.dka_usulan for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- ---------------------------------------------------------------------
-- 3. Item usulan DKA (FM-01 baris kebutuhan).
-- ---------------------------------------------------------------------
create table if not exists public.dka_usulan_item (
  id uuid primary key default gen_random_uuid(),
  usulan_id uuid not null references public.dka_usulan(id) on delete cascade,
  urutan int not null default 0,
  unit_kerja text,
  nama_kegiatan text,
  klasifikasi_id uuid references public.aset_klasifikasi(id),
  nama_aset text not null,
  spesifikasi text,
  ruangan_id uuid references public.ruangan(id) on delete set null,
  lokasi text,
  penanggung_jawab text,
  alasan_kebutuhan text,
  cara_pengadaan text,
  sumber_anggaran text,
  jumlah_maksimal numeric(12,2) not null default 0 check (jumlah_maksimal >= 0),
  jumlah_tersedia numeric(12,2) not null default 0 check (jumlah_tersedia >= 0),
  jumlah_riil numeric(12,2) generated always as (greatest(jumlah_maksimal - jumlah_tersedia, 0)) stored,
  jumlah_pengajuan numeric(12,2) not null default 0 check (jumlah_pengajuan >= 0),
  satuan text not null default 'unit',
  harga_satuan numeric(16,2) not null default 0 check (harga_satuan >= 0),
  standar_harga numeric(16,2),
  jumlah_harga numeric(18,2) generated always as (jumlah_pengajuan * harga_satuan) stored,
  justifikasi text,
  created_at timestamptz not null default now()
);
create index if not exists dka_usulan_item_usulan_idx on public.dka_usulan_item (usulan_id);
create index if not exists dka_usulan_item_klas_idx on public.dka_usulan_item (klasifikasi_id);

alter table public.dka_usulan_item enable row level security;

-- Visibilitas item mengikuti header-nya.
drop policy if exists dka_usulan_item_select on public.dka_usulan_item;
create policy dka_usulan_item_select on public.dka_usulan_item for select using (
  exists (
    select 1 from public.dka_usulan u
    where u.id = usulan_id
      and (public.is_yayasan_admin() or public.has_school_access(u.school_id))
  )
);

-- Menulis item: Yayasan kapan pun; sekolah HANYA selama usulan
-- draft/dikembalikan (belum/tidak sedang dikunci). Menurunkan predikat
-- kepemilikan header, bukan sekadar visibilitas.
drop policy if exists dka_usulan_item_write on public.dka_usulan_item;
create policy dka_usulan_item_write on public.dka_usulan_item for all using (
  exists (
    select 1 from public.dka_usulan u
    where u.id = usulan_id and (
      public.is_yayasan_admin() or
      (u.status in ('draft', 'dikembalikan') and public.is_school_manager(u.school_id))
    )
  )
) with check (
  exists (
    select 1 from public.dka_usulan u
    where u.id = usulan_id and (
      public.is_yayasan_admin() or
      (u.status in ('draft', 'dikembalikan') and public.is_school_manager(u.school_id))
    )
  )
);

-- ---------------------------------------------------------------------
-- 4. RPC: Jumlah Aset Tersedia dari Buku Inventaris (integrasi Tahap 1).
--    Menghitung jumlah aset AKTIF pada unit + klasifikasi tertentu,
--    supaya "Jumlah Aset Tersedia" di FM-01 tak perlu dihitung manual.
--    Menjumlahkan kolom `jumlah` (bukan cuma baris) agar sesuai stok riil.
-- ---------------------------------------------------------------------
create or replace function public.dka_hitung_tersedia(p_school_id uuid, p_klasifikasi_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_total numeric;
begin
  if not (public.is_yayasan_admin() or public.has_school_access(p_school_id)) then
    raise exception 'Tidak berwenang' using errcode = '42501';
  end if;
  select coalesce(sum(jumlah), 0) into v_total
  from public.aset
  where school_id = p_school_id
    and klasifikasi_id = p_klasifikasi_id
    and status = 'aktif';
  return v_total;
end;
$$;
