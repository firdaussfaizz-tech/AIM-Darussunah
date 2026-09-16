# SIMPEG Yayasan — Modul SDM/Kepegawaian (Tahap 1)

Sistem informasi kepegawaian untuk yayasan yang menaungi unit **SD, SMP, dan SMA**.
Ini adalah **modul pertama (MVP)** dari rencana ERP 6 modul yang diminta:

| # | Modul | Status |
|---|---|---|
| 6 | **Human Resources Development (SDM/Kepegawaian)** | ✅ Dibangun di proyek ini |
| 1 | Student Information Management | ⏳ Belum — tahap berikutnya |
| 2 | Academic Management | ⏳ Belum |
| 3 | Financial Management | ⏳ Belum |
| 4 | Resource Management | ⏳ Belum |
| 5 | Communication Management | ⏳ Belum |

Tabel `schools`, `profiles`, dan `user_roles` di skema ini sengaja dirancang sebagai
fondasi bersama, supaya modul-modul berikutnya (Akademik, Keuangan, dst.) bisa
langsung menyambung tanpa mengubah struktur yang sudah ada.

## Fitur yang sudah berjalan

- **Data induk pegawai** — biodata, riwayat pendidikan, riwayat kerja, dokumen (unggah ke Storage), kontrak kerja
- **Struktur organisasi** — unit sekolah (SD/SMP/SMA), unit kerja/departemen, jabatan
- **Presensi** — input kehadiran harian oleh admin/HR, riwayat presensi per pegawai
- **Cuti & izin** — pengajuan oleh pegawai, persetujuan oleh admin/HR/kepala sekolah
- **Penggajian** — komponen gaji per pegawai, proses periode bulanan, slip gaji
- **Kinerja** — penilaian per periode dengan beberapa aspek nilai
- **Pelatihan & pengembangan** — program pelatihan dan daftar peserta
- **Pengguna & peran** — kontrol akses berbasis peran (lihat tabel di bawah)
- Tampilan otomatis menyesuaikan peran: **manajer** (Admin Yayasan/HR/Admin Sekolah/Kepala Sekolah)
  melihat mode kelola; **guru/staf** melihat mode swalayan (data diri sendiri saja)

## Peran pengguna

| Peran | Lingkup | Akses |
|---|---|---|
| `admin_yayasan` | Seluruh yayasan | Akses penuh semua data & fitur |
| `hr` | Seluruh yayasan | Setara admin_yayasan untuk modul SDM (termasuk gaji) |
| `admin_sekolah` | 1 unit sekolah | Kelola data pegawai, presensi, cuti, kinerja **di sekolahnya saja**; tidak bisa lihat gaji pegawai lain |
| `kepala_sekolah` | 1 unit sekolah | Sama seperti admin_sekolah (persetujuan cuti, kinerja) |
| `guru` / `staff` | Diri sendiri | Mode swalayan: lihat/ajukan data milik sendiri saja |

Satu akun bisa memiliki lebih dari satu peran (misalnya HR yang juga Kepala Sekolah).

---

## 1. Menjalankan skema database di Supabase

Buka proyek Supabase Anda → **SQL Editor** → jalankan file-file di folder
`supabase/migrations/` **secara berurutan**:

1. `0001_init_hr_schema.sql` — seluruh tabel, relasi, dan Row Level Security
2. `0002_seed_data.sql` — data awal (3 unit sekolah placeholder, unit kerja,
   jenis cuti, periode kinerja). **Sunting nama sekolah di bagian atas file ini**
   sebelum menjalankannya agar sesuai nama sekolah yayasan Anda yang sebenarnya
   (atau edit lagi nanti lewat menu "Struktur Organisasi" di aplikasi).
3. `0003_storage.sql` — membuat bucket privat `employee-files` untuk foto & dokumen pegawai

> Pastikan **Authentication → Providers → Email** aktif (biasanya sudah default aktif di Supabase).

### Membuat akun Admin Yayasan pertama

1. Jalankan aplikasi (lihat langkah 2 di bawah), buka halaman **Daftar**, buat akun dengan email Anda.
2. Kembali ke Supabase SQL Editor, jalankan (ganti email):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin_yayasan' from auth.users where email = 'email.anda@yayasan.sch.id';
   ```
3. Login kembali ke aplikasi — menu lengkap (Struktur Organisasi, Pengguna & Peran, dll.) akan muncul.
4. Untuk pegawai/guru lain: buat akun mereka lewat halaman Daftar (atau Anda buatkan lewat
   Supabase Dashboard → Authentication → Add user), lalu di menu **Pengguna & Peran**:
   - klik ikon 🔗 untuk **menautkan** akun tersebut ke data pegawai yang sudah ada, dan/atau
   - klik ikon **+** untuk memberi peran (misalnya `admin_sekolah` untuk kepala TU, atau
     `guru`/`staff` untuk akses swalayan).

---

## 2. Menjalankan di komputer lokal (opsional, untuk pengecekan sebelum deploy)

```bash
npm install
cp .env.example .env
# isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env
# (Project Settings > API di Supabase Dashboard)
npm run dev
```

---

## 3. Deploy ke Netlify

Proyek ini sudah menyertakan `netlify.toml` (build command `npm run build`,
folder publish `dist`, plus redirect SPA agar refresh halaman tidak 404).

**Opsi A — hubungkan repo Git (disarankan, agar update berikutnya otomatis)**
1. Push folder proyek ini ke repository GitHub/GitLab Anda.
2. Di Netlify: **Add new site → Import an existing project**, pilih repo tersebut.
3. Build settings akan terisi otomatis dari `netlify.toml`.
4. Di **Site settings → Environment variables**, tambahkan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

**Opsi B — unggah manual**
```bash
npm run build
```
Lalu drag folder `dist/` ke Netlify (Sites → "Deploy manually"). Karena env
var Vite disematkan saat *build*, pastikan `.env` sudah terisi benar sebelum
menjalankan `npm run build` jika memakai cara ini.

> Hanya gunakan **anon/public key** Supabase di aplikasi ini — jangan pernah
> menaruh *service role key* di frontend/Netlify env var, karena itu akan
> memberi akses penuh bypass semua aturan keamanan (RLS) ke siapa pun yang
> membuka DevTools.

---

## Catatan keamanan & keterbatasan MVP ini

- Row Level Security (RLS) sudah diterapkan di semua tabel dengan pola: Admin
  Yayasan/HR akses penuh, Admin Sekolah/Kepala Sekolah terbatas ke sekolahnya,
  pegawai hanya melihat datanya sendiri. **Disarankan direview lagi** oleh
  yang memahami kebijakan internal yayasan sebelum dipakai untuk data produksi
  sensitif (terutama gaji).
- Perhitungan gaji bersifat sederhana (gaji pokok + tunjangan − potongan).
  Belum ada perhitungan otomatis PPh 21, BPJS sesuai aturan terbaru, atau
  lembur — komponen tersebut untuk saat ini diinput manual per pegawai.
- Pendaftaran akun baru (halaman "Daftar") belum otomatis memberi akses apa
  pun — akses baru aktif setelah Admin Yayasan memberi peran secara manual.
  Ini disengaja demi keamanan, tapi berarti perlu proses onboarding manual.
- Belum ada notifikasi email/WhatsApp otomatis (misalnya saat cuti disetujui).
  Ini bisa ditambahkan di tahap berikutnya menggunakan Supabase Edge Functions.

## Langkah berikutnya (modul lain)

Saat siap melanjutkan ke modul lain (Data Siswa & Akademik, Keuangan, dll.),
sampaikan saja — skema `schools` dan `profiles`/`user_roles` di proyek ini
bisa langsung dipakai ulang, sehingga tidak perlu membangun ulang dari nol.
