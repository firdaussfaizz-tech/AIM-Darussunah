import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  BookMarked, CheckCircle2, Clock, XCircle, Archive, PencilLine, Send, Undo2,
  Trash2, History, Info, FileSignature, ShieldCheck, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { SectionCard, Badge, Button, Textarea, EmptyState, FullPageSpinner } from '../../components/ui'

// ============================================================================
// SISTEM PEMBANGUN KURIKULUM ISLAM PLUS — modul Akademik.
//
// Tim Penyusun menyusun isi tiap bagian outline (kerangka dari SK Tim
// Penyusun Kurikulum Islam Plus No. 01.006/SK-YDC/IV/26, Lampiran 2)
// sebagai AJUAN. Admin Yayasan MENETAPKAN (acc) atau MENOLAK. Isi yang
// ditetapkan menjadi kurikulum resmi; versi lama diarsipkan otomatis.
//
// "Islam Plus" = Islam Aswaja (Ahlussunah wal Jamaah), Bahasa Arab, & Tahfidz.
// Data: tabel public.kip_entri (lihat migrasi 0092).
// ============================================================================

// ---- Kerangka/outline Kurikulum Islam Plus (SK Lampiran 2) ----
// Tiap bagian: { kode, judul, petunjuk } — petunjuk = panduan pengisian.
const KIP_OUTLINE = [
  {
    bab: 'Bagian Awal', ket: 'Kelengkapan dokumen',
    items: [
      { kode: 'PRA.1', judul: 'Kata Pengantar', petunjuk: 'Pengantar dokumen Kurikulum Islam Plus dari penyusun/kepala sekolah.' },
      { kode: 'PRA.2', judul: 'SK Pemberlakuan Kurikulum Islam Plus', petunjuk: 'Surat keputusan pemberlakuan kurikulum oleh Ketua Yayasan.' },
    ],
  },
  {
    bab: 'Bab I — Landasan Kurikulum', ket: 'Dasar pemikiran, tujuan, struktur, prinsip',
    items: [
      { kode: 'I.A', judul: 'Latar Belakang Pemikiran', petunjuk: 'Dasar munculnya Islam Plus sebagai kurikulum. Pemantik: (a) Apa itu Islam Plus (Islam Aswaja, Bahasa Arab, Tahfidz) & urgensinya bagi karakter siswa Aswaja? (b) Apa pembedanya dibanding yang lain (NU, MD, Al-Azhar, Al-Irsyad)? (c) Hubungkan dengan tantangan zaman & visi pendidikan Islam Plus.' },
      { kode: 'I.B', judul: 'Tujuan Pengembangan Kurikulum Islam Plus', petunjuk: 'Rumuskan 4–6 tujuan yang spesifik, terukur, & relevan: peningkatan kompetensi keagamaan, penguatan ideologi Aswaja, penguasaan Bahasa Arab & Tahfidz.' },
      { kode: 'I.C', judul: 'Visi, Misi, dan Tujuan Pendidikan Ahlussunah wal Jamaah', petunjuk: 'Kutip visi & misi resmi yayasan, lalu jabarkan relevansinya dengan Kurikulum Islam Plus.' },
      { kode: 'I.D', judul: 'Muatan / Struktur Kurikulum Islam Plus', petunjuk: 'Sajikan dalam bentuk tabel: (a) Mata Pelajaran Islam Plus, (b) Alokasi jam/minggu, (c) Distribusi per kelas (I s/d XII).' },
      { kode: 'I.E', judul: 'Beban Belajar Kurikulum Islam Plus', petunjuk: 'Tentukan total jam pelajaran per tahun/semester tiap mapel Islam Plus. Sesuaikan dengan ketentuan Kurikulum Nasional.' },
      { kode: 'I.F', judul: 'Prinsip Penyusunan Kurikulum', petunjuk: 'Uraikan 5–7 prinsip: relevansi, fleksibilitas, efisiensi, efektivitas, kesinambungan, integrasi nilai Aswaja, dst.' },
      { kode: 'I.G', judul: 'Prinsip Pengelolaan Kurikulum', petunjuk: 'Bagaimana kurikulum dikelola, penanggung jawab, mekanisme pembaruan, serta koordinasi antar Mapel Islam Plus.' },
      { kode: 'I.H', judul: 'Pihak yang Terlibat', petunjuk: 'Siapa saja yang terlibat dalam penyusunan Kurikulum Islam Plus.' },
    ],
  },
  {
    bab: 'Bab II — Standar Kompetensi Lulusan', ket: 'Profil lulusan SD–SMA',
    items: [
      { kode: 'II', judul: 'Standar Kompetensi Lulusan', petunjuk: 'Rumuskan profil lulusan SD–SMA yang telah menempuh Kurikulum Islam Plus: aspek Aqidah, Ibadah, Akhlak, Manhaj Ahlussunah wal Jamaah, Kemampuan Bahasa Arab, dan Tahfidz.' },
    ],
  },
  {
    bab: 'Bab III — Standar Isi', ket: 'Ruang lingkup & KI/KD/CP per jenjang',
    items: [
      { kode: 'III.0', judul: 'Ruang Lingkup Materi', petunjuk: 'Ruang lingkup materi Islam Plus: kelas I–VI (perkembangan kognitif SD), VII–IX (kesinambungan & peningkatan level), X–XII (kajian tematik, isu kontemporer, wawasan global Islam).' },
      { kode: 'III.A', judul: 'Kelas SD — KI/KD/CP', petunjuk: 'Jabarkan Kompetensi Inti (KI) & Kompetensi Dasar (KD) / Capaian Pembelajaran (CP) Mapel Islam Plus: Kelas I–III, Kelas IV–V, Kelas VI.' },
      { kode: 'III.B', judul: 'Kelas SMP — KI/KD/CP', petunjuk: 'Jabarkan KI & KD / CP Mapel Islam Plus: Kelas VII, Kelas VIII, Kelas IX.' },
      { kode: 'III.C', judul: 'Kelas SMA — KI/KD/CP', petunjuk: 'Jabarkan KI & KD / CP Mapel Islam Plus: Kelas X, Kelas XI, Kelas XII.' },
    ],
  },
  {
    bab: 'Bab IV — Standar Proses', ket: 'Pendekatan & pelaksanaan pembelajaran',
    items: [
      { kode: 'IV.A', judul: 'Dasar Pemikiran', petunjuk: 'Landasan pemilihan & perancangan Islam Plus sebagai kurikulum pembelajaran. Pendekatan: SD (aktif, menyenangkan, adaptif), SMP (reflektif, kontekstual, berbasis manhaj Aswaja), SMA (analitis, berbasis riset, kontribusi sosial).' },
      { kode: 'IV.B', judul: 'Prinsip Pembelajaran', petunjuk: 'Uraikan 4–7 prinsip utama pembelajaran Islam Plus.' },
      { kode: 'IV.C', judul: 'Perencanaan Pembelajaran', petunjuk: 'Komponen wajib dalam perencanaan pembelajaran Islam Plus.' },
      { kode: 'IV.D', judul: 'Pelaksanaan Pembelajaran', petunjuk: 'Persyaratan pelaksanaan, buku teks, pengelolaan kelas & lab, pelaksanaan (pendahuluan/inti/penutup), penilaian proses & hasil, pengawasan proses.' },
    ],
  },
  {
    bab: 'Bab V — Standar Guru Islam Plus', ket: 'Kualifikasi & kompetensi guru',
    items: [
      { kode: 'V.A', judul: 'Pendahuluan', petunjuk: 'Pentingnya guru Islam Plus: kompeten akademik & pedagogik, sekaligus teladan nilai Ahlussunah wal Jamaah.' },
      { kode: 'V.B', judul: 'Maksud dan Tujuan', petunjuk: 'Rumusan penetapan standar guru Islam Plus.' },
      { kode: 'V.C', judul: 'Ketentuan Umum', petunjuk: 'Ketentuan dasar guru Islam Plus.' },
      { kode: 'V.D', judul: 'Persyaratan', petunjuk: 'Persyaratan formal: kualifikasi akademik, sertifikasi, hafalan minimal, kemampuan baca kitab, keaktifan, dll.' },
    ],
  },
  {
    bab: 'Bab VI — Standar Penilaian', ket: 'Sistem & mekanisme penilaian',
    items: [
      { kode: 'VI.A', judul: 'Dasar Pemikiran', petunjuk: 'Filosofi penilaian Islam Plus, disesuaikan tiap jenjang.' },
      { kode: 'VI.B', judul: 'Tujuan', petunjuk: 'Tujuan penilaian: memantau perkembangan & mengukur pencapaian KD/CP.' },
      { kode: 'VI.C', judul: 'Ruang Lingkup', petunjuk: 'Cakupan penilaian: seluruh mapel Islam Plus pada semua jenjang.' },
      { kode: 'VI.D', judul: 'Prinsip-prinsip Penilaian', petunjuk: 'Shahih, objektif, adil, terpadu, terbuka, dst.' },
      { kode: 'VI.E', judul: 'Penilaian oleh Guru', petunjuk: 'Proses penilaian oleh pendidik & tujuannya.' },
      { kode: 'VI.F', judul: 'Penilaian Sikap', petunjuk: 'Instrumen & rubrik: observasi guru, penilaian antarteman (peer assessment), penilaian diri. Fokus akhlak & karakter sesuai manhaj Aswaja.' },
      { kode: 'VI.G', judul: 'Penilaian Pengetahuan', petunjuk: 'Instrumen & rubrik: pengertian & teknik penilaian.' },
      { kode: 'VI.H', judul: 'Penilaian Keterampilan', petunjuk: 'Instrumen & rubrik: pengertian & teknik penilaian.' },
      { kode: 'VI.I', judul: 'Pelaksanaan Penilaian oleh Guru', petunjuk: 'Jadwal, prosedur, perumusan indikator & pelaksanaan penilaian.' },
      { kode: 'VI.J', judul: 'Laporan Hasil Penilaian', petunjuk: 'Tentukan format rapor Islam Plus.' },
      { kode: 'VI.K', judul: 'Pembelajaran Remedial dan Pengayaan', petunjuk: 'Mekanisme remedial (di bawah KKM) & pengayaan (di atas KKM): bentuk pelaksanaan & hasil penilaian.' },
      { kode: 'VI.L', judul: 'Kriteria Kenaikan Kelas', petunjuk: 'Tetapkan KKM Mapel Islam Plus, bobot nilai, & kriteria kenaikan kelas.' },
    ],
  },
  {
    bab: 'Bab VII — Penutup & Silabus', ket: 'Penutup, referensi, silabus',
    items: [
      { kode: 'VII.1', judul: 'Penutup & Referensi', petunjuk: 'Penutup dokumen & daftar referensi.' },
      { kode: 'VII.2', judul: 'Silabus SD', petunjuk: 'Silabus Kurikulum Islam Plus jenjang SD.' },
      { kode: 'VII.3', judul: 'Silabus SMP', petunjuk: 'Silabus Kurikulum Islam Plus jenjang SMP.' },
      { kode: 'VII.4', judul: 'Silabus SMA', petunjuk: 'Silabus Kurikulum Islam Plus jenjang SMA.' },
    ],
  },
]

const ALL_ITEMS = KIP_OUTLINE.flatMap((b) => b.items)

const STATUS_META = {
  draft: { label: 'Draft', color: 'neutral', icon: PencilLine },
  diajukan: { label: 'Diajukan', color: 'gold', icon: Clock },
  ditetapkan: { label: 'Ditetapkan', color: 'success', icon: CheckCircle2 },
  ditolak: { label: 'Ditolak', color: 'danger', icon: XCircle },
  diarsipkan: { label: 'Diarsipkan', color: 'neutral', icon: Archive },
}

const fmtTgl = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function KurikulumIslamPlus({ ctx }) {
  const isYayasan = !!ctx?.hasFullAccess // Admin Yayasan: boleh menetapkan/menolak
  const employee = ctx?.employee

  const [entri, setEntri] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(ALL_ITEMS[0].kode)
  const [busy, setBusy] = useState(false)
  const [openBab, setOpenBab] = useState(() => ({ [KIP_OUTLINE[0].bab]: true }))

  // Pastikan Bab yang memuat bagian terpilih selalu terbuka.
  useEffect(() => {
    const bab = KIP_OUTLINE.find((b) => b.items.some((i) => i.kode === selected))
    if (bab) setOpenBab((o) => (o[bab.bab] ? o : { ...o, [bab.bab]: true }))
  }, [selected])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('kip_entri')
      .select('*')
      .order('bagian_kode', { ascending: true })
      .order('versi', { ascending: false })
    setEntri(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Kelompokkan entri per bagian.
  const byKode = useMemo(() => {
    const m = new Map()
    for (const e of entri) {
      if (!m.has(e.bagian_kode)) m.set(e.bagian_kode, [])
      m.get(e.bagian_kode).push(e)
    }
    return m
  }, [entri])

  const infoBagian = useCallback((kode) => {
    const list = byKode.get(kode) || []
    const ditetapkan = list.find((e) => e.status === 'ditetapkan') || null
    const aktif = list.find((e) => e.status === 'draft' || e.status === 'diajukan') || null
    const riwayat = list.filter((e) => e.status === 'ditolak' || e.status === 'diarsipkan')
    // Status ringkas untuk indikator navigasi.
    let ringkas = 'kosong'
    if (aktif) ringkas = aktif.status
    else if (ditetapkan) ringkas = 'ditetapkan'
    return { list, ditetapkan, aktif, riwayat, ringkas }
  }, [byKode])

  // Progres: jumlah bagian yang sudah ditetapkan.
  const progres = useMemo(() => {
    let ditetapkan = 0; let diajukan = 0
    for (const it of ALL_ITEMS) {
      const info = infoBagian(it.kode)
      if (info.ditetapkan) ditetapkan++
      if (info.aktif?.status === 'diajukan') diajukan++
    }
    return { total: ALL_ITEMS.length, ditetapkan, diajukan, pct: Math.round((ditetapkan / ALL_ITEMS.length) * 100) }
  }, [infoBagian])

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      {/* Intro + progres */}
      <SectionCard
        title="Sistem Pembangun Kurikulum Islam Plus"
        description="Tim Penyusun menyusun isi tiap bagian sebagai ajuan; Admin Yayasan menetapkan (acc) atau menolak. Isi yang ditetapkan menjadi kurikulum resmi."
      >
        <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-navy-50)] p-4">
          <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[14px] text-[var(--color-ink)]">
            Kerangka mengikuti <strong>SK Tim Penyusun Kurikulum Islam Plus</strong> (No. 01.006/SK-YDC/IV/26).
            <strong> Islam Plus</strong> = Islam Aswaja (Ahlussunah wal Jamaah), Bahasa Arab, dan Tahfidz.
          </p>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="text-[var(--color-ink-soft)]">Progres penetapan kurikulum</span>
            <span className="font-medium text-[var(--color-ink)]">{progres.ditetapkan} / {progres.total} bagian ditetapkan · {progres.diajukan} menunggu</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${progres.pct}%` }} />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Navigasi outline — tiap Bab dapat dilipat */}
        <div className="flex flex-col gap-3">
          {KIP_OUTLINE.map((bab) => {
            const open = !!openBab[bab.bab]
            const total = bab.items.length
            const done = bab.items.filter((it) => infoBagian(it.kode).ditetapkan).length
            return (
              <div key={bab.bab} className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white">
                <button
                  type="button"
                  onClick={() => setOpenBab((o) => ({ ...o, [bab.bab]: !o[bab.bab] }))}
                  className="btn-press flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{bab.bab}</span>
                  <Badge color={done === total ? 'success' : done > 0 ? 'gold' : 'neutral'}>{done}/{total}</Badge>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--color-ink-soft)] transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="flex flex-col gap-1 border-t border-[var(--color-border)] p-2">
                    {bab.items.map((it) => {
                      const info = infoBagian(it.kode)
                      const isSel = selected === it.kode
                      return (
                        <button
                          key={it.kode}
                          type="button"
                          onClick={() => setSelected(it.kode)}
                          className={`btn-press flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors ${
                            isSel ? 'bg-[var(--color-navy)] text-white' : 'hover:bg-[var(--color-paper)] text-[var(--color-ink)]'
                          }`}
                        >
                          <span className="flex-1">{it.judul}</span>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${
                            info.ringkas === 'ditetapkan' ? 'bg-[var(--color-success)]'
                              : info.ringkas === 'diajukan' ? 'bg-[var(--color-gold)]'
                              : info.ringkas === 'draft' ? 'bg-[var(--color-ink-soft)]'
                              : 'bg-black/15'
                          }`} title={STATUS_META[info.ringkas]?.label || 'Belum diisi'} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Detail bagian terpilih */}
        <BagianDetail
          kode={selected}
          info={infoBagian(selected)}
          isYayasan={isYayasan}
          employee={employee}
          busy={busy}
          setBusy={setBusy}
          reload={load}
        />
      </div>
    </div>
  )
}

function BagianDetail({ kode, info, isYayasan, employee, busy, setBusy, reload }) {
  const item = ALL_ITEMS.find((i) => i.kode === kode)
  const { ditetapkan, aktif, riwayat } = info

  const [konten, setKonten] = useState('')
  const [catatan, setCatatan] = useState('')
  const [reviu, setReviu] = useState('')
  const [mode, setMode] = useState('view') // 'view' | 'edit'

  // Reset form saat pindah bagian atau data berubah.
  useEffect(() => {
    setKonten(aktif?.konten || '')
    setCatatan(aktif?.catatan_penyusun || '')
    setReviu('')
    setMode('view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kode, aktif?.id])

  const maxVersi = Math.max(0, ...info.list.map((e) => e.versi || 0))

  const simpanDraft = async ({ ajukan = false } = {}) => {
    setBusy(true)
    const payload = {
      bagian_kode: kode,
      bagian_judul: item.judul,
      konten,
      catatan_penyusun: catatan || null,
      disusun_oleh: employee?.id || null,
      disusun_nama: employee?.nama || null,
      status: ajukan ? 'diajukan' : 'draft',
      ...(ajukan ? { diajukan_at: new Date().toISOString() } : {}),
    }
    let err
    if (aktif) {
      ({ error: err } = await supabase.from('kip_entri').update(payload).eq('id', aktif.id))
    } else {
      ({ error: err } = await supabase.from('kip_entri').insert({ ...payload, versi: maxVersi + 1 }))
    }
    setBusy(false)
    if (err) { alert('Gagal menyimpan: ' + err.message); return }
    await reload()
  }

  const mulaiRevisi = () => {
    setKonten(ditetapkan?.konten || '')
    setCatatan('')
    setMode('edit')
  }

  const tarikAjuan = async () => {
    setBusy(true)
    const { error } = await supabase.from('kip_entri').update({ status: 'draft', diajukan_at: null }).eq('id', aktif.id)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    await reload()
  }

  const hapusDraft = async () => {
    if (!window.confirm('Hapus draft bagian ini?')) return
    setBusy(true)
    const { error } = await supabase.from('kip_entri').delete().eq('id', aktif.id)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    await reload()
  }

  const putuskan = async (keputusan) => {
    if (keputusan === 'ditolak' && !reviu.trim()) { alert('Mohon isi catatan alasan penolakan.'); return }
    setBusy(true)
    const { error } = await supabase.from('kip_entri').update({
      status: keputusan,
      catatan_reviu: reviu || null,
      direviu_oleh: employee?.id || null,
      direviu_nama: employee?.nama || null,
      direviu_at: new Date().toISOString(),
    }).eq('id', aktif.id)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    await reload()
  }

  const StatusBadge = ({ status }) => {
    const m = STATUS_META[status]; if (!m) return null
    const Icon = m.icon
    return <Badge color={m.color}><Icon className="mr-1 inline h-3.5 w-3.5" />{m.label}</Badge>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header bagian + petunjuk */}
      <SectionCard title={`${kode} · ${item.judul}`}>
        <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-gold-soft)] p-3.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-gold)]" />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-gold)]">Panduan Pengisian</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-ink)]">{item.petunjuk}</p>
          </div>
        </div>
      </SectionCard>

      {/* Isi resmi yang telah ditetapkan */}
      {ditetapkan && (
        <SectionCard
          title="Isi Resmi (Ditetapkan)"
          actions={<StatusBadge status="ditetapkan" />}
        >
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-ink)]">{ditetapkan.konten || '—'}</p>
          <p className="mt-3 text-[12px] text-[var(--color-ink-soft)]">
            Versi {ditetapkan.versi} · ditetapkan {fmtTgl(ditetapkan.direviu_at)}
            {ditetapkan.direviu_nama ? ` oleh ${ditetapkan.direviu_nama}` : ''}
            {ditetapkan.disusun_nama ? ` · disusun oleh ${ditetapkan.disusun_nama}` : ''}
          </p>
        </SectionCard>
      )}

      {/* Ajuan aktif / penyusunan */}
      <SectionCard
        title={aktif ? 'Ajuan Berjalan' : (ditetapkan ? 'Revisi Isi' : 'Mulai Menyusun')}
        actions={aktif ? <StatusBadge status={aktif.status} /> : null}
      >
        {/* Status: diajukan (menunggu keputusan) */}
        {aktif && aktif.status === 'diajukan' && mode === 'view' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-gold-soft)] p-3.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-gold)]" />
              <p className="text-[13px] text-[var(--color-ink)]">
                Diajukan {fmtTgl(aktif.diajukan_at)}{aktif.disusun_nama ? ` oleh ${aktif.disusun_nama}` : ''} · menunggu keputusan Yayasan.
              </p>
            </div>
            <p className="whitespace-pre-wrap rounded-[12px] border border-[var(--color-border)] bg-[var(--color-paper)] p-3.5 text-[14px] leading-relaxed text-[var(--color-ink)]">{aktif.konten || '—'}</p>
            {aktif.catatan_penyusun && <p className="text-[13px] text-[var(--color-ink-soft)]"><strong>Catatan penyusun:</strong> {aktif.catatan_penyusun}</p>}

            {/* Keputusan Yayasan */}
            {isYayasan ? (
              <div className="flex flex-col gap-2.5 rounded-[12px] border border-[var(--color-border)] p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink)]"><ShieldCheck className="h-4 w-4 text-[var(--color-navy)]" /> Keputusan Yayasan</p>
                <Textarea rows={2} placeholder="Catatan untuk penyusun (wajib bila menolak)…" value={reviu} onChange={(e) => setReviu(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => putuskan('ditetapkan')} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Tetapkan</Button>
                  <Button size="sm" variant="danger" onClick={() => putuskan('ditolak')} disabled={busy}><XCircle className="h-4 w-4" /> Tolak</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={tarikAjuan} disabled={busy}><Undo2 className="h-4 w-4" /> Tarik Ajuan</Button>
              </div>
            )}
          </div>
        )}

        {/* Status: draft (penyusunan) atau mode edit */}
        {((aktif && aktif.status === 'draft') || mode === 'edit' || (!aktif && !ditetapkan)) && (
          <div className="flex flex-col gap-3">
            {aktif?.catatan_reviu && (
              <div className="flex items-start gap-2 rounded-[12px] bg-[var(--color-danger-soft)] p-3 text-[13px] text-[var(--color-danger)]">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>Catatan reviu sebelumnya:</strong> {aktif.catatan_reviu}</span>
              </div>
            )}
            <Textarea
              label="Isi Bagian"
              rows={10}
              placeholder="Tulis isi bagian ini sesuai panduan di atas…"
              value={konten}
              onChange={(e) => setKonten(e.target.value)}
            />
            <Textarea
              label="Catatan Penyusun (opsional)"
              rows={2}
              placeholder="Catatan untuk Yayasan saat mengajukan…"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => simpanDraft({ ajukan: false })} disabled={busy || !konten.trim()}><PencilLine className="h-4 w-4" /> Simpan Draft</Button>
              <Button size="sm" onClick={() => simpanDraft({ ajukan: true })} disabled={busy || !konten.trim()}><Send className="h-4 w-4" /> Ajukan ke Yayasan</Button>
              {aktif && aktif.status === 'draft' && (
                <Button size="sm" variant="ghost" onClick={hapusDraft} disabled={busy}><Trash2 className="h-4 w-4" /> Hapus Draft</Button>
              )}
              {mode === 'edit' && !aktif && (
                <Button size="sm" variant="ghost" onClick={() => setMode('view')} disabled={busy}>Batal</Button>
              )}
            </div>
          </div>
        )}

        {/* Tidak ada ajuan aktif, tapi sudah ada yang ditetapkan → tombol revisi */}
        {!aktif && ditetapkan && mode === 'view' && (
          <div className="flex flex-col gap-3">
            <EmptyState icon={FileSignature} title="Tidak ada ajuan berjalan" description="Isi resmi sudah ditetapkan. Buat revisi untuk mengajukan perubahan." />
            <div><Button size="sm" onClick={mulaiRevisi}><PencilLine className="h-4 w-4" /> Buat Revisi</Button></div>
          </div>
        )}
      </SectionCard>

      {/* Riwayat */}
      {riwayat.length > 0 && (
        <SectionCard title="Riwayat" description="Versi lama yang diarsipkan atau ajuan yang ditolak">
          <div className="flex flex-col gap-2.5">
            {riwayat.map((r) => (
              <div key={r.id} className="rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  <span className="text-[12px] text-[var(--color-ink-soft)]">Versi {r.versi} · {fmtTgl(r.direviu_at || r.updated_at)}{r.disusun_nama ? ` · ${r.disusun_nama}` : ''}</span>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] text-[var(--color-ink-soft)]">{r.konten || '—'}</p>
                {r.catatan_reviu && <p className="mt-1 text-[12px] text-[var(--color-danger)]"><History className="mr-1 inline h-3 w-3" />{r.catatan_reviu}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
