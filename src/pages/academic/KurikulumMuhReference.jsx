import { useState } from 'react'
import { BookMarked, Compass, Star, Layers, GraduationCap, ScrollText, Landmark, Home, Sparkles } from 'lucide-react'
import { SectionCard, Badge, Table, Tr, Td } from '../../components/ui'

// ============================================================================
// Halaman Referensi "Kurikulum Muhammadiyah" (read-only) — modul Akademik.
//
// Sumber:
//  1. Kurikulum Pendidikan Muhammadiyah 2024 (SK PP Muhammadiyah
//     No. 521/KEP/I.4/F/2024) — kerangka integrasi ISMUBA + Kurikulum
//     Pemerintah/Merdeka, serta struktur mata pelajaran SD/SMP/SMA.
//  2. Kurikulum ISMUBA SMA/SMK/MA Muhammadiyah 2017 (SK Majelis Dikdasmen
//     No. 98/KEP/I.4/F/2017) — rincian isi mata pelajaran ciri khusus.
//
// Catatan: halaman ini bersifat REFERENSI/panduan (tidak menulis ke database).
// JP = Jam Pelajaran. Angka JP di tabel struktur adalah JP per minggu
// (asumsi struktur Kurikulum Pendidikan Muhammadiyah 2024).
// ============================================================================

const DASAR_HUKUM = [
  {
    kode: 'SK 521/KEP/I.4/F/2024',
    judul: 'Kurikulum Pendidikan Muhammadiyah 2024',
    penerbit: 'Pimpinan Pusat Muhammadiyah',
    peran: 'Kerangka dasar & struktur — mengintegrasikan ISMUBA dengan Kurikulum Pemerintah (Merdeka) untuk jenjang SD, SMP, dan SMA/sederajat.',
  },
  {
    kode: 'SK 98/KEP/I.4/F/2017',
    judul: 'Kurikulum ISMUBA (Al-Islam, Kemuhammadiyahan, Bahasa Arab)',
    penerbit: 'Majelis Dikdasmen PP Muhammadiyah',
    peran: 'Rincian isi mata pelajaran ciri khusus (Al-Qur’an Hadits, Aqidah Akhlak, Fikih, Tarikh, Kemuhammadiyahan, Bahasa Arab) beserta SKL.',
  },
]

// 8 ciri Profil Pelajar Berkemajuan (tujuan Kurikulum Pendidikan Muhammadiyah 2024)
const PROFIL_BERKEMAJUAN = [
  'Taat beragama dan berakhlak mulia',
  'Berbuat baik kepada orang tua, guru, dan sesama',
  'Bermotivasi tinggi dan berprestasi',
  'Gemar membaca, menulis, dan berkreasi',
  'Berilmu dan berkeahlian tinggi',
  'Berwatak disiplin, kerja keras, dan mandiri',
  'Bekerja sama dan berperan di masyarakat',
  'Cinta bangsa dan cinta kemanusiaan semesta',
]

const PRINSIP = [
  ['Integrasi Nilai ISMUBA', 'Nilai Al-Islam & Kemuhammadiyahan diintegrasikan pada semua mata pelajaran, bukan hanya mapel agama.'],
  ['Berbasis Islam Berkemajuan', 'Berlandaskan paham Islam yang berkemajuan, wasathiyah (moderat), dan membebaskan.'],
  ['Holistik & Kemanusiaan Universal', 'Mengembangkan seluruh potensi (iman, ilmu, amal) dan nilai kemanusiaan universal.'],
  ['Relevansi Global', 'Relevan dengan perkembangan ilmu pengetahuan, teknologi, dan tantangan global.'],
  ['Pemberdayaan Peserta Didik', 'Menempatkan peserta didik sebagai subjek aktif yang diberdayakan.'],
  ['Inklusif, Partisipatif, Adaptif', 'Terbuka bagi semua, melibatkan banyak pihak, dan menyesuaikan konteks satuan pendidikan.'],
]

const POLA_INTEGRASI = [
  ['Multidisipliner', 'Satu tema dikaji dari beberapa mata pelajaran yang masih berdiri sendiri.'],
  ['Interdisipliner', 'Beberapa mata pelajaran dipadukan untuk mengkaji satu tema secara terhubung.'],
  ['Transdisipliner', 'Pembelajaran berangkat dari masalah nyata, melampaui batas antar mata pelajaran.'],
]

const KARAKTERISTIK = [
  'Berbasis ISMUBA', 'Holistik Integratif', 'Mindful, Meaningful, Joyful',
  'Berbasis Aktivitas', 'Interdisipliner', 'Partisipasi Aktif', 'Kontekstual',
  'Karakter & Soft Skills', 'Lifelong Learning', 'Evaluasi Berbasis Kompetensi',
  'Pemanfaatan Teknologi', 'Kolaboratif', 'Kreativitas & Inovasi',
]

const LANDASAN = [
  ['Idiil', 'Al-Islam yang wasathiyah/berkemajuan, pembentukan karakter Islami, Kemuhammadiyahan, dan Bahasa Arab sebagai bahasa sumber ajaran Islam.'],
  ['Filosofis', 'Tauhid, pandangan holistik-integratif, Islam berkemajuan, amar ma’ruf nahi munkar, humanisme religius, keadilan sosial, serta sikap inklusif-partisipatif-adaptif.'],
  ['Sosiologis', 'Menjawab tantangan zaman (era digital, VUCA, globalisasi) dengan tetap berpijak pada nilai keislaman dan keindonesiaan.'],
]

// ---- Struktur mata pelajaran per jenjang (JP = jam pelajaran per minggu) ----
// kel: 'kekhasan' (ISMUBA) | 'umum'
const STRUKTUR = {
  SD: {
    label: 'SD / MI',
    asumsi: '1 JP = 35 menit · ± 36 minggu efektif/tahun',
    mapel: [
      { kel: 'kekhasan', nama: 'Pendidikan Al-Islam', jp: '3 + kokurikuler', ket: 'Intrakurikuler + BTQ/Tahsin/Tahfidz & Pendalaman Materi Ibadah (pembiasaan salat & doa)' },
      { kel: 'kekhasan', nama: 'Pendidikan Kemuhammadiyahan', jp: '1', ket: 'Didukung ekstra Hizbul Wathan / Tapak Suci & kunjungan ranting' },
      { kel: 'kekhasan', nama: 'Pendidikan Bahasa Arab', jp: '1', ket: 'Pembiasaan kosakata & komunikasi sederhana' },
      { kel: 'umum', nama: 'Pendidikan Pancasila', jp: '5', ket: '' },
      { kel: 'umum', nama: 'Bahasa Indonesia', jp: '6–7', ket: '' },
      { kel: 'umum', nama: 'Matematika', jp: '5–6', ket: '' },
      { kel: 'umum', nama: 'IPAS', jp: '5', ket: 'Ilmu Pengetahuan Alam & Sosial' },
      { kel: 'umum', nama: 'PJOK', jp: '3', ket: '' },
      { kel: 'umum', nama: 'Seni Budaya', jp: '3', ket: 'Minimal 1 jenis seni' },
      { kel: 'umum', nama: 'Bahasa Inggris', jp: '2', ket: 'Dapat berupa pembiasaan' },
      { kel: 'umum', nama: 'Muatan Lokal', jp: '2', ket: 'Sesuai kekhasan daerah/sekolah' },
    ],
  },
  SMP: {
    label: 'SMP / MTs',
    asumsi: '1 JP = 40 menit · ± 32–36 minggu efektif/tahun',
    mapel: [
      { kel: 'kekhasan', nama: 'Pendidikan Al-Islam', jp: '2 + kokurikuler', ket: 'Intra + BTQ/Tahsin/Tahfidz & Pendalaman Materi Ibadah + pembiasaan ibadah' },
      { kel: 'kekhasan', nama: 'Pendidikan Kemuhammadiyahan', jp: '1 + IPM', ket: 'Intra + kokurikuler Ikatan Pelajar Muhammadiyah & ekstra HW/Tapak Suci' },
      { kel: 'kekhasan', nama: 'Pendidikan Bahasa Arab', jp: '1–2', ket: '' },
      { kel: 'umum', nama: 'Pendidikan Pancasila', jp: '2', ket: '' },
      { kel: 'umum', nama: 'Bahasa Indonesia', jp: '6', ket: '' },
      { kel: 'umum', nama: 'Matematika', jp: '5', ket: '' },
      { kel: 'umum', nama: 'Ilmu Pengetahuan Alam (IPA)', jp: '5', ket: '' },
      { kel: 'umum', nama: 'Ilmu Pengetahuan Sosial (IPS)', jp: '4', ket: '' },
      { kel: 'umum', nama: 'Bahasa Inggris', jp: '4', ket: '' },
      { kel: 'umum', nama: 'PJOK', jp: '3', ket: '' },
      { kel: 'umum', nama: 'Informatika', jp: '3', ket: '' },
      { kel: 'umum', nama: 'Seni Budaya', jp: '3', ket: 'Minimal 1 jenis seni' },
      { kel: 'umum', nama: 'Muatan Lokal', jp: '2', ket: '' },
    ],
  },
  SMA: {
    label: 'SMA / MA',
    asumsi: '1 JP = 45 menit · ± 32–36 minggu efektif/tahun. Kelas XI–XII menambahkan Kelompok Mapel Pilihan.',
    mapel: [
      { kel: 'kekhasan', nama: 'Pendidikan Al-Islam', jp: '2 + kokurikuler', ket: 'Intra + BTQ/Tahsin/Tahfidz & Pendalaman Materi Ibadah + pembiasaan (kultum, khotbah/pidato)' },
      { kel: 'kekhasan', nama: 'Pendidikan Kemuhammadiyahan', jp: '1 + IPM', ket: 'Intra + IPM + ekstra HW/Tapak Suci, kunjungan AUM & kajian' },
      { kel: 'kekhasan', nama: 'Pendidikan Bahasa Arab', jp: '2', ket: '' },
      { kel: 'umum', nama: 'Pendidikan Pancasila', jp: '2–3', ket: '' },
      { kel: 'umum', nama: 'Bahasa Indonesia', jp: '3–4', ket: '' },
      { kel: 'umum', nama: 'Matematika', jp: '3–4', ket: '' },
      { kel: 'umum', nama: 'IPA (Fisika, Kimia, Biologi)', jp: '6–9', ket: '' },
      { kel: 'umum', nama: 'IPS (Sosiologi, Ekonomi, Sejarah, Geografi)', jp: '8–12', ket: '' },
      { kel: 'umum', nama: 'Bahasa Inggris', jp: '3', ket: '' },
      { kel: 'umum', nama: 'PJOK', jp: '2–3', ket: '' },
      { kel: 'umum', nama: 'Informatika', jp: '2', ket: '' },
      { kel: 'umum', nama: 'Seni Budaya', jp: '2', ket: 'Minimal 1 jenis seni' },
      { kel: 'umum', nama: 'Muatan Lokal', jp: '2', ket: '' },
    ],
    pilihan: [
      'Antropologi', 'Bahasa Arab', 'Bahasa Indonesia Tingkat Lanjut', 'Bahasa Inggris Tingkat Lanjut',
      'Bahasa Jepang', 'Bahasa Jerman', 'Bahasa Korea', 'Bahasa Mandarin', 'Bahasa Perancis',
      'Biologi', 'Ekonomi', 'Fisika', 'Geografi', 'Informatika', 'Kimia',
      'Matematika Tingkat Lanjut', 'Sejarah Tingkat Lanjut', 'Sosiologi', 'Prakarya & Kewirausahaan',
    ],
  },
}

// Rincian mapel ISMUBA (acuan ISMUBA SMA 2017; JP per minggu)
const ISMUBA = [
  { nama: 'Al-Qur’an Hadits', jp: 3, fokus: 'Membaca, memahami, dan mengamalkan Al-Qur’an & Hadits.' },
  { nama: 'Aqidah Akhlak', jp: 2, fokus: 'Penguatan tauhid dan pembentukan akhlak mulia.' },
  { nama: 'Fikih (Ibadah & Muamalah)', jp: 3, fokus: 'Tata cara ibadah dan hukum muamalah sesuai tarjih.' },
  { nama: 'Tarikh / SKI', jp: 1, fokus: 'Sejarah Islam dan keteladanan tokoh.' },
  { nama: 'Kemuhammadiyahan', jp: 1, fokus: 'Sejarah, ideologi, dan gerakan Muhammadiyah.' },
  { nama: 'Bahasa Arab', jp: 2, fokus: 'Keterampilan berbahasa Arab sebagai bahasa sumber ajaran Islam.' },
]

const TABS = [
  { key: 'kerangka', label: 'Kerangka Dasar', icon: Compass },
  { key: 'struktur', label: 'Struktur per Jenjang', icon: Layers },
  { key: 'ismuba', label: 'ISMUBA & Kekhasan', icon: Star },
  { key: 'boarding', label: 'Boarding & Pembiasaan', icon: Home },
  { key: 'dasar', label: 'Dasar Hukum & Catatan', icon: ScrollText },
]

function NumberedCard({ n, title, desc }) {
  return (
    <div className="flex gap-3 rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-navy-50)] text-[13px] font-semibold text-[var(--color-navy)]">{n}</span>
      <div>
        <p className="font-medium text-[var(--color-ink)]">{title}</p>
        {desc && <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">{desc}</p>}
      </div>
    </div>
  )
}

function StrukturTabel({ data }) {
  const kekhasan = data.mapel.filter((m) => m.kel === 'kekhasan')
  const umum = data.mapel.filter((m) => m.kel === 'umum')
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[var(--color-ink-soft)]">{data.asumsi}</p>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge color="gold">Kelompok Kekhasan · ISMUBA</Badge>
          <span className="text-[13px] text-[var(--color-ink-soft)]">Ciri khusus pendidikan Muhammadiyah</span>
        </div>
        <div className="overflow-x-auto">
          <Table columns={['Mata Pelajaran', 'JP/minggu', 'Keterangan']}>
            {kekhasan.map((m) => (
              <Tr key={m.nama}>
                <Td className="font-medium">{m.nama}</Td>
                <Td><Badge color="navy">{m.jp}</Badge></Td>
                <Td className="text-[13px] text-[var(--color-ink-soft)]">{m.ket || '—'}</Td>
              </Tr>
            ))}
          </Table>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge color="navy">Kelompok Umum</Badge>
          <span className="text-[13px] text-[var(--color-ink-soft)]">Mengikuti Kurikulum Pemerintah (Merdeka) + integrasi nilai ISMUBA</span>
        </div>
        <div className="overflow-x-auto">
          <Table columns={['Mata Pelajaran', 'JP/minggu', 'Keterangan']}>
            {umum.map((m) => (
              <Tr key={m.nama}>
                <Td className="font-medium">{m.nama}</Td>
                <Td>{m.jp}</Td>
                <Td className="text-[13px] text-[var(--color-ink-soft)]">{m.ket || '—'}</Td>
              </Tr>
            ))}
          </Table>
        </div>
      </div>
      {data.pilihan && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge color="success">Kelompok Mapel Pilihan (Kelas XI–XII)</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.pilihan.map((p) => (
              <span key={p} className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[13px] text-[var(--color-ink)]">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function KurikulumMuhReference() {
  const [tab, setTab] = useState('kerangka')
  const [jenjang, setJenjang] = useState('SD')

  return (
    <div className="flex flex-col gap-5">
      {/* Intro */}
      <SectionCard
        title="Kurikulum Pendidikan Muhammadiyah"
        description="Panduan referensi kerangka dan struktur kurikulum untuk jenjang SD, SMP, SMA, dan program Boarding — integrasi ISMUBA dengan Kurikulum Merdeka."
      >
        <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-navy-50)] p-4">
          <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[14px] text-[var(--color-ink)]">
            Kurikulum Pendidikan Muhammadiyah 2024 menjadi <strong>payung integrasi</strong> yang menyatukan
            kekhasan <strong>ISMUBA</strong> (Al-Islam, Kemuhammadiyahan, Bahasa Arab) dengan
            Kurikulum Pemerintah (Merdeka). Rincian isi mapel ciri khusus mengacu pada
            <strong> Kurikulum ISMUBA 2017</strong>. Tujuannya membentuk <strong>Pelajar Berkemajuan</strong>.
          </p>
        </div>
      </SectionCard>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon
          const activeTab = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`btn-press inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab
                  ? 'bg-[var(--color-navy)] text-white'
                  : 'border border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ---- Kerangka Dasar ---- */}
      {tab === 'kerangka' && (
        <div className="flex flex-col gap-5">
          <SectionCard title="Visi" description="Arah pendidikan Muhammadiyah">
            <p className="text-[14px] text-[var(--color-ink)]">
              Terwujudnya transformasi pendidikan berbasis Al-Islam dan Kemuhammadiyahan yang
              holistik-integratif untuk membentuk <strong>Pelajar Berkemajuan</strong> — insan berilmu,
              beriman, berakhlak mulia, dan bermanfaat bagi bangsa serta kemanusiaan semesta.
            </p>
          </SectionCard>

          <SectionCard title="Profil Pelajar Berkemajuan" description="8 ciri lulusan yang menjadi tujuan kurikulum">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {PROFIL_BERKEMAJUAN.map((p, i) => (
                <NumberedCard key={p} n={i + 1} title={p} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Prinsip Pengembangan" description="6 prinsip dasar kurikulum">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {PRINSIP.map(([t, d], i) => (
                <NumberedCard key={t} n={i + 1} title={t} desc={d} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Pola Integrasi Nilai ISMUBA" description="Cara nilai keislaman menyatu di semua mapel">
            <div className="grid gap-2.5 sm:grid-cols-3">
              {POLA_INTEGRASI.map(([t, d]) => (
                <div key={t} className="rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
                  <div className="mb-1 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--color-gold)]" />
                    <p className="font-medium text-[var(--color-ink)]">{t}</p>
                  </div>
                  <p className="text-[13px] text-[var(--color-ink-soft)]">{d}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Karakteristik Pembelajaran" description="13 karakter pembelajaran Muhammadiyah">
            <div className="flex flex-wrap gap-2">
              {KARAKTERISTIK.map((k) => (
                <span key={k} className="rounded-full bg-[var(--color-navy-50)] px-3 py-1 text-[13px] font-medium text-[var(--color-navy)]">{k}</span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Landasan" description="Pijakan filosofis kurikulum">
            <div className="flex flex-col gap-2.5">
              {LANDASAN.map(([t, d]) => (
                <div key={t} className="flex gap-3 rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
                  <Badge color="gold">{t}</Badge>
                  <p className="text-[13px] text-[var(--color-ink)]">{d}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ---- Struktur per Jenjang ---- */}
      {tab === 'struktur' && (
        <SectionCard
          title="Struktur Mata Pelajaran"
          description="Daftar mapel & alokasi JP per minggu menurut Kurikulum Pendidikan Muhammadiyah 2024"
          actions={
            <div className="flex gap-1.5">
              {Object.entries(STRUKTUR).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setJenjang(k)}
                  className={`btn-press rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    jenjang === k ? 'bg-[var(--color-navy)] text-white' : 'border border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          }
        >
          <StrukturTabel data={STRUKTUR[jenjang]} />
        </SectionCard>
      )}

      {/* ---- ISMUBA ---- */}
      {tab === 'ismuba' && (
        <div className="flex flex-col gap-5">
          <SectionCard
            title="Mata Pelajaran ISMUBA"
            description="Rincian kelompok ciri khusus (acuan Kurikulum ISMUBA 2017 — contoh jenjang SMA)"
          >
            <div className="overflow-x-auto">
              <Table columns={['Mata Pelajaran', 'JP/minggu', 'Fokus']}>
                {ISMUBA.map((m) => (
                  <Tr key={m.nama}>
                    <Td className="font-medium">{m.nama}</Td>
                    <Td><Badge color="navy">{m.jp} JP</Badge></Td>
                    <Td className="text-[13px] text-[var(--color-ink-soft)]">{m.fokus}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
            <p className="mt-3 text-[13px] text-[var(--color-ink-soft)]">
              Total ± 12 JP/minggu. Pada jenjang SD & SMP, mapel-mapel ini dirangkum dalam
              <strong> Pendidikan Al-Islam</strong>, <strong>Kemuhammadiyahan</strong>, dan
              <strong> Bahasa Arab</strong> sesuai tingkat perkembangan peserta didik.
            </p>
          </SectionCard>

          <SectionCard title="Standar Kompetensi Lulusan (SKL) ISMUBA" description="3 dimensi penilaian">
            <div className="grid gap-2.5 sm:grid-cols-3">
              {[
                ['Sikap', 'Menghayati & mengamalkan nilai keislaman dalam keseharian.'],
                ['Pengetahuan', 'Memahami ajaran Islam, ke-Muhammadiyahan, & Bahasa Arab.'],
                ['Keterampilan', 'Menerapkan ibadah, dakwah, & komunikasi berbahasa Arab.'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
                  <p className="font-medium text-[var(--color-ink)]">{t}</p>
                  <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">{d}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ---- Boarding & Pembiasaan ---- */}
      {tab === 'boarding' && (
        <div className="flex flex-col gap-5">
          <SectionCard
            title="Penguatan di Program Boarding"
            description="Boarding memperkuat kokurikuler & pembiasaan ISMUBA di luar jam intrakurikuler"
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                ['Tahfidz & Tahsin Al-Qur’an', 'Program hafalan & perbaikan bacaan terjadwal harian.'],
                ['Pembiasaan Ibadah', 'Salat berjamaah, salat sunnah rawatib, dhuha, doa harian, puasa sunnah.'],
                ['Pendalaman Materi Ibadah', 'Praktik fikih ibadah & muamalah secara langsung.'],
                ['Kajian Keislaman & Kemuhammadiyahan', 'Kultum, kajian rutin, pengenalan gerakan & AUM.'],
                ['Hizbul Wathan & Tapak Suci', 'Kepanduan & bela diri sebagai ekstrakurikuler khas.'],
                ['Ikatan Pelajar Muhammadiyah (IPM)', 'Kaderisasi & kepemimpinan pelajar.'],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-3 rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-navy)]" />
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">{t}</p>
                    <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ---- Dasar Hukum & Catatan ---- */}
      {tab === 'dasar' && (
        <div className="flex flex-col gap-5">
          <SectionCard title="Dasar Hukum" description="Regulasi rujukan kurikulum">
            <div className="flex flex-col gap-3">
              {DASAR_HUKUM.map((d) => (
                <div key={d.kode} className="flex gap-3 rounded-[12px] border border-[var(--color-border)] bg-white p-4">
                  <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gold)]" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="gold">{d.kode}</Badge>
                      <p className="font-medium text-[var(--color-ink)]">{d.judul}</p>
                    </div>
                    <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">{d.penerbit}</p>
                    <p className="mt-1 text-[13px] text-[var(--color-ink)]">{d.peran}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Catatan Penggunaan">
            <ul className="flex flex-col gap-2 text-[13px] text-[var(--color-ink)]">
              <li>• Halaman ini bersifat <strong>referensi</strong> dan tidak mengubah data mata pelajaran atau KKTP di sistem.</li>
              <li>• Angka JP adalah <strong>JP per minggu</strong> acuan; alokasi final menyesuaikan kalender & kondisi tiap satuan pendidikan.</li>
              <li>• Untuk mengelola mapel & KKTP yang aktif di sistem, gunakan menu <strong>Mata Pelajaran</strong> dan <strong>Kurikulum &amp; KKTP</strong>.</li>
              <li>• Mapel ISMUBA bersifat <strong>wajib</strong>; sebagian kokurikuler/ekstra bersifat pendukung sesuai kesiapan sumber daya sekolah.</li>
            </ul>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
