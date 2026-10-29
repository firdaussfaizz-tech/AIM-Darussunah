import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Layers, CheckCircle2, Clock, XCircle, Archive, PencilLine, Send, Undo2,
  Trash2, History, Info, FileSignature, ShieldCheck, BookMarked, ChevronDown, School, FileDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { SectionCard, Badge, Button, Textarea, EmptyState, FullPageSpinner } from '../../components/ui'
import {
  StrukturKurikulumEditor, StrukturKurikulumView, parseStruktur, strukturKosong, ringkasStruktur,
  BebanBelajarView, parseBeban,
} from '../../components/StrukturKurikulumEditor'
import { RichTextEditor, RichTextView, htmlKosong } from '../../components/RichTextEditor'

// ============================================================================
// SISTEM PEMBANGUN KURIKULUM SATUAN PENDIDIKAN (KOSP) — modul Akademik.
//
// Setelah Kurikulum Islam Plus ditetapkan, tiap satuan (SD/SMP/SMA/Boarding)
// menyusun Kurikulum Operasional Satuan Pendidikan yang MEMADUKAN Kurikulum
// Islam Plus dengan Kurikulum Nasional (Merdeka).
//
// Alur: Tim Penyusun satuan menyusun tiap bagian → Ajuan → Admin Yayasan
// Menetapkan (acc)/Menolak. Isi ditetapkan = KOSP resmi; versi lama diarsip.
// PER-SATUAN: data di-scope ke unit terpilih (ctx.effSchoolId).
//
// Data: public.ksp_entri (migrasi 0093). Rujukan: public.kip_entri (ditetapkan).
// ============================================================================

const KSP_OUTLINE = [
  {
    bab: 'Bagian Awal', ket: 'Kelengkapan dokumen',
    items: [
      { kode: 'PRA.1', judul: 'Lembar Pengesahan', petunjuk: 'Lembar pengesahan KOSP oleh kepala satuan, komite, dan pengawas/yayasan.' },
      { kode: 'PRA.2', judul: 'Kata Pengantar', petunjuk: 'Pengantar dokumen Kurikulum Operasional Satuan Pendidikan.' },
    ],
  },
  {
    bab: 'Bab I — Karakteristik Satuan Pendidikan', ket: 'Analisis konteks',
    items: [
      { kode: 'I.A', judul: 'Analisis Karakteristik Satuan', petunjuk: 'Potret satuan: lingkungan geografis & sosial-budaya, peserta didik, guru & tenaga kependidikan, sarana-prasarana, serta kemitraan.' },
      { kode: 'I.B', judul: 'Analisis Kebutuhan & Potensi', petunjuk: 'Kebutuhan & potensi satuan, termasuk kekhasan Islam Plus (Aswaja, Bahasa Arab, Tahfidz) sebagai pembeda satuan.' },
    ],
  },
  {
    bab: 'Bab II — Visi, Misi, dan Tujuan', ket: 'Arah satuan pendidikan',
    items: [
      { kode: 'II.A', judul: 'Visi Satuan Pendidikan', petunjuk: 'Visi satuan yang selaras dengan visi yayasan & nilai Ahlussunah wal Jamaah.' },
      { kode: 'II.B', judul: 'Misi Satuan Pendidikan', petunjuk: 'Misi sebagai langkah mewujudkan visi (nasional + Islam Plus).' },
      { kode: 'II.C', judul: 'Tujuan Satuan Pendidikan', petunjuk: 'Tujuan jangka pendek & menengah, memadukan capaian nasional dengan profil lulusan Islam Plus.' },
    ],
  },
  {
    bab: 'Bab III — Pengorganisasian Pembelajaran', ket: 'Struktur & muatan kurikulum',
    items: [
      { kode: 'III.A', judul: 'Struktur Kurikulum', tipe: 'struktur', petunjuk: 'Isi tabel struktur: tiap baris satu mata pelajaran (muatan Nasional/Merdeka + Islam Plus + mulok), tiap kolom kelas diisi alokasi JP per minggu. Jumlah Jam terhitung otomatis.' },
      { kode: 'III.B', judul: 'Muatan & Intrakurikuler', petunjuk: 'Daftar mata pelajaran (nasional + Islam Plus) beserta alokasi JP dan capaian yang diharapkan.' },
      { kode: 'III.C', judul: 'Projek Penguatan Profil Pelajar Pancasila (P5)', petunjuk: 'Tema, alokasi, dan dimensi P5 — dipadukan dengan aktualisasi nilai Islam Plus (kokurikuler).' },
      { kode: 'III.D', judul: 'Ekstrakurikuler', petunjuk: 'Program ekstrakurikuler, termasuk ekskul keislaman/Tahfidz/Bahasa Arab.' },
      { kode: 'III.E', judul: 'Integrasi Kurikulum Islam Plus', petunjuk: 'INTI PEMADUAN: bagaimana Islam Plus (Aqidah/Ibadah/Akhlak Aswaja, Bahasa Arab, Tahfidz) dipadukan ke intrakurikuler, kokurikuler, dan pembiasaan satuan.' },
      { kode: 'III.F', judul: 'Beban Belajar & Kalender Pendidikan', petunjuk: 'Pengaturan beban belajar, hari efektif, dan kalender pendidikan satuan.' },
    ],
  },
  {
    bab: 'Bab IV — Perencanaan Pembelajaran', ket: 'CP → TP → ATP, asesmen',
    items: [
      { kode: 'IV.A', judul: 'Ruang Lingkup Satuan (CP → TP → ATP)', petunjuk: 'Penurunan Capaian Pembelajaran menjadi Tujuan Pembelajaran & Alur Tujuan Pembelajaran per mapel (termasuk mapel Islam Plus).' },
      { kode: 'IV.B', judul: 'Ruang Lingkup Kelas (Modul Ajar)', petunjuk: 'Perencanaan tingkat kelas: modul ajar / RPP, pendekatan, dan media.' },
      { kode: 'IV.C', judul: 'Asesmen', petunjuk: 'Asesmen formatif & sumatif, serta penetapan KKTP (termasuk KKTP Islam Plus).' },
      { kode: 'IV.D', judul: 'Peraturan Akademik', petunjuk: 'Kriteria kenaikan kelas & kelulusan, memadukan ketuntasan nasional dengan KKTP Islam Plus.' },
    ],
  },
  {
    bab: 'Bab V — Pendampingan, Evaluasi & Pengembangan Profesional', ket: 'Penjaminan mutu',
    items: [
      { kode: 'V.A', judul: 'Pendampingan', petunjuk: 'Mekanisme pendampingan guru dalam implementasi kurikulum.' },
      { kode: 'V.B', judul: 'Evaluasi Kurikulum & Pembelajaran', petunjuk: 'Evaluasi berkala terhadap dokumen & implementasi KOSP.' },
      { kode: 'V.C', judul: 'Pengembangan Profesional', petunjuk: 'Program PKB / In-House Training untuk guru nasional & guru Islam Plus.' },
    ],
  },
  {
    bab: 'Bab VI — Penutup & Lampiran', ket: 'Penutup & dokumen pendukung',
    items: [
      { kode: 'VI.1', judul: 'Penutup', petunjuk: 'Penutup dokumen KOSP.' },
      { kode: 'VI.2', judul: 'Lampiran', petunjuk: 'ATP, contoh Modul Ajar, KKTP, Kalender Pendidikan, SK Tim Penyusun.' },
    ],
  },
]

const ALL_ITEMS = KSP_OUTLINE.flatMap((b) => b.items)

const STATUS_META = {
  draft: { label: 'Draft', color: 'neutral', icon: PencilLine },
  diajukan: { label: 'Diajukan', color: 'gold', icon: Clock },
  ditetapkan: { label: 'Ditetapkan', color: 'success', icon: CheckCircle2 },
  ditolak: { label: 'Ditolak', color: 'danger', icon: XCircle },
  diarsipkan: { label: 'Diarsipkan', color: 'neutral', icon: Archive },
}

const fmtTgl = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const plainText = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()

export default function KurikulumSatuanPendidikan({ ctx }) {
  const isYayasan = !!ctx?.hasFullAccess
  const employee = ctx?.employee
  const effSchoolId = ctx?.effSchoolId || ''

  const schoolLabel = useMemo(() => {
    const pool = [...(ctx?.schools || []), ...(ctx?.mySchools || [])]
    const s = pool.find((x) => x.id === effSchoolId)
    if (s) return `${s.jenjang ? s.jenjang + ' — ' : ''}${s.nama || ''}`.trim()
    return ctx?.employee?.schools?.nama || ''
  }, [ctx, effSchoolId])

  const [entri, setEntri] = useState([])
  const [islamPlus, setIslamPlus] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(ALL_ITEMS[0].kode)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showRujukan, setShowRujukan] = useState(false)
  const [openBab, setOpenBab] = useState(() => ({ [KSP_OUTLINE[0].bab]: true }))

  // Pastikan Bab yang memuat bagian terpilih selalu terbuka.
  useEffect(() => {
    const bab = KSP_OUTLINE.find((b) => b.items.some((i) => i.kode === selected))
    if (bab) setOpenBab((o) => (o[bab.bab] ? o : { ...o, [bab.bab]: true }))
  }, [selected])

  const load = useCallback(async () => {
    if (!effSchoolId) { setEntri([]); setLoading(false); return }
    setLoading(true)
    const [{ data: ks }, { data: ip }] = await Promise.all([
      supabase.from('ksp_entri').select('*').eq('school_id', effSchoolId)
        .order('bagian_kode', { ascending: true }).order('versi', { ascending: false }),
      supabase.from('kip_entri').select('bagian_kode, bagian_judul, konten, versi, direviu_at')
        .eq('school_id', effSchoolId).eq('status', 'ditetapkan').order('bagian_kode', { ascending: true }),
    ])
    setEntri(ks || [])
    setIslamPlus(ip || [])
    setLoading(false)
  }, [effSchoolId])

  useEffect(() => { load() }, [load])

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
    let ringkas = 'kosong'
    if (aktif) ringkas = aktif.status
    else if (ditetapkan) ringkas = 'ditetapkan'
    return { list, ditetapkan, aktif, riwayat, ringkas }
  }, [byKode])

  const progres = useMemo(() => {
    let ditetapkan = 0; let diajukan = 0
    for (const it of ALL_ITEMS) {
      const info = infoBagian(it.kode)
      if (info.ditetapkan) ditetapkan++
      if (info.aktif?.status === 'diajukan') diajukan++
    }
    return { total: ALL_ITEMS.length, ditetapkan, diajukan, pct: Math.round((ditetapkan / ALL_ITEMS.length) * 100) }
  }, [infoBagian])

  if (!effSchoolId) {
    return <EmptyState icon={School} title="Pilih unit terlebih dahulu" description="Kurikulum Satuan Pendidikan disusun per satuan. Pilih unit (SD/SMP/SMA/Boarding) pada bar di atas untuk mulai menyusun." />
  }
  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title={`Kurikulum Satuan Pendidikan${schoolLabel ? ' — ' + schoolLabel : ''}`}
        description="Kurikulum Operasional Satuan Pendidikan (KOSP) yang memadukan Kurikulum Islam Plus dengan Kurikulum Nasional. Disusun Tim Penyusun satuan, ditetapkan Yayasan."
        actions={
          <Button size="sm" variant="outline" onClick={async () => {
            setExporting(true)
            try {
              const kontenByKode = {}
              for (const it of ALL_ITEMS) kontenByKode[it.kode] = infoBagian(it.kode).ditetapkan?.konten || ''
              const slug = (schoolLabel || 'Satuan').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
              const { exportKurikulumDocx } = await import('../../lib/docxExport')
              exportKurikulumDocx({
                filename: `Kurikulum-Satuan-Pendidikan-${slug}.docx`,
                title: 'Kurikulum Satuan Pendidikan (KOSP)',
                subtitle: `${schoolLabel || ''} · YPI Darussunah Cibarusah`.replace(/^ · /, ''),
                outline: KSP_OUTLINE,
                kontenByKode,
              })
            } finally { setExporting(false) }
          }} disabled={exporting}>
            <FileDown className="h-4 w-4" /> {exporting ? 'Menyiapkan…' : 'Ekspor ke Word'}
          </Button>
        }
      >
        <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-navy-50)] p-4">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[14px] text-[var(--color-ink)]">
            Dokumen ini <strong>memadukan</strong> Kurikulum Nasional (Merdeka) dengan <strong>Kurikulum Islam Plus</strong> yang telah ditetapkan.
            Gunakan panel <em>Rujukan Islam Plus</em> di bawah sebagai acuan saat menyusun.
          </p>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="text-[var(--color-ink-soft)]">Progres penetapan KOSP</span>
            <span className="font-medium text-[var(--color-ink)]">{progres.ditetapkan} / {progres.total} bagian ditetapkan · {progres.diajukan} menunggu</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${progres.pct}%` }} />
          </div>
        </div>
      </SectionCard>

      {/* Panel rujukan Kurikulum Islam Plus yang telah ditetapkan */}
      <div className="rounded-[14px] border border-[var(--color-border)] bg-white">
        <button
          type="button"
          onClick={() => setShowRujukan((v) => !v)}
          className="btn-press flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[14px] font-medium text-[var(--color-ink)]">
            <BookMarked className="h-4 w-4 text-[var(--color-navy)]" />
            Rujukan Kurikulum Islam Plus (ditetapkan)
            <Badge color={islamPlus.length ? 'success' : 'neutral'}>{islamPlus.length} bagian</Badge>
          </span>
          <ChevronDown className={`h-4 w-4 text-[var(--color-ink-soft)] transition-transform ${showRujukan ? 'rotate-180' : ''}`} />
        </button>
        {showRujukan && (
          <div className="border-t border-[var(--color-border)] p-4">
            {islamPlus.length === 0 ? (
              <p className="text-[13px] text-[var(--color-ink-soft)]">Belum ada bagian Kurikulum Islam Plus yang ditetapkan. Tetapkan Islam Plus lebih dahulu melalui menu <strong>Kurikulum Islam Plus</strong> agar dapat dirujuk di sini.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {islamPlus.map((r) => (
                  <details key={r.bagian_kode} className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-paper)] p-2.5">
                    <summary className="cursor-pointer text-[13px] font-medium text-[var(--color-ink)]">{r.bagian_kode} · {r.bagian_judul}</summary>
                    {parseStruktur(r.konten) ? <div className="mt-2"><StrukturKurikulumView konten={r.konten} /></div>
                      : parseBeban(r.konten) ? <div className="mt-2"><BebanBelajarView konten={r.konten} /></div>
                      : <div className="mt-2"><RichTextView html={r.konten} /></div>}
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Navigasi outline — tiap Bab dapat dilipat */}
        <div className="flex flex-col gap-3">
          {KSP_OUTLINE.map((bab) => {
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

        <BagianDetail
          kode={selected}
          schoolId={effSchoolId}
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

function BagianDetail({ kode, schoolId, info, isYayasan, employee, busy, setBusy, reload }) {
  const item = ALL_ITEMS.find((i) => i.kode === kode)
  const { ditetapkan, aktif, riwayat } = info
  const isStruktur = item.tipe === 'struktur'

  const [konten, setKonten] = useState('')
  const [catatan, setCatatan] = useState('')
  const [reviu, setReviu] = useState('')
  const [mode, setMode] = useState('view')
  const [revisiTick, setRevisiTick] = useState(0)
  const editorKey = `${kode}:${aktif?.id || 'baru'}:${revisiTick}`

  useEffect(() => {
    setKonten(aktif?.konten || '')
    setCatatan(aktif?.catatan_penyusun || '')
    setReviu('')
    setMode('view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kode, aktif?.id, schoolId])

  const maxVersi = Math.max(0, ...info.list.map((e) => e.versi || 0))
  const kontenKosong = isStruktur ? strukturKosong(parseStruktur(konten)) : htmlKosong(konten)

  const simpanDraft = async ({ ajukan = false } = {}) => {
    setBusy(true)
    const payload = {
      school_id: schoolId,
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
      ({ error: err } = await supabase.from('ksp_entri').update(payload).eq('id', aktif.id))
    } else {
      ({ error: err } = await supabase.from('ksp_entri').insert({ ...payload, versi: maxVersi + 1 }))
    }
    setBusy(false)
    if (err) { alert('Gagal menyimpan: ' + err.message); return }
    await reload()
  }

  const mulaiRevisi = () => {
    setKonten(ditetapkan?.konten || '')
    setCatatan('')
    setMode('edit')
    setRevisiTick((t) => t + 1)
  }

  const tarikAjuan = async () => {
    setBusy(true)
    const { error } = await supabase.from('ksp_entri').update({ status: 'draft', diajukan_at: null }).eq('id', aktif.id)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    await reload()
  }

  const hapusDraft = async () => {
    if (!window.confirm('Hapus draft bagian ini?')) return
    setBusy(true)
    const { error } = await supabase.from('ksp_entri').delete().eq('id', aktif.id)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    await reload()
  }

  const putuskan = async (keputusan) => {
    if (keputusan === 'ditolak' && !reviu.trim()) { alert('Mohon isi catatan alasan penolakan.'); return }
    setBusy(true)
    const { error } = await supabase.from('ksp_entri').update({
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
      <SectionCard title={`${kode} · ${item.judul}`}>
        <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-gold-soft)] p-3.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-gold)]" />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-gold)]">Panduan Pengisian</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-ink)]">{item.petunjuk}</p>
          </div>
        </div>
      </SectionCard>

      {ditetapkan && (
        <SectionCard title="Isi Resmi (Ditetapkan)" actions={<StatusBadge status="ditetapkan" />}>
          {isStruktur
            ? <StrukturKurikulumView konten={ditetapkan.konten} />
            : <RichTextView html={ditetapkan.konten} />}
          <p className="mt-3 text-[12px] text-[var(--color-ink-soft)]">
            Versi {ditetapkan.versi} · ditetapkan {fmtTgl(ditetapkan.direviu_at)}
            {ditetapkan.direviu_nama ? ` oleh ${ditetapkan.direviu_nama}` : ''}
            {ditetapkan.disusun_nama ? ` · disusun oleh ${ditetapkan.disusun_nama}` : ''}
          </p>
        </SectionCard>
      )}

      <SectionCard
        title={aktif ? 'Ajuan Berjalan' : (ditetapkan ? 'Revisi Isi' : 'Mulai Menyusun')}
        actions={aktif ? <StatusBadge status={aktif.status} /> : null}
      >
        {aktif && aktif.status === 'diajukan' && mode === 'view' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-[12px] bg-[var(--color-gold-soft)] p-3.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-gold)]" />
              <p className="text-[13px] text-[var(--color-ink)]">
                Diajukan {fmtTgl(aktif.diajukan_at)}{aktif.disusun_nama ? ` oleh ${aktif.disusun_nama}` : ''} · menunggu keputusan Yayasan.
              </p>
            </div>
            {isStruktur
              ? <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-paper)] p-3.5"><StrukturKurikulumView konten={aktif.konten} /></div>
              : <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-paper)] p-3.5"><RichTextView html={aktif.konten} /></div>}
            {aktif.catatan_penyusun && <p className="text-[13px] text-[var(--color-ink-soft)]"><strong>Catatan penyusun:</strong> {aktif.catatan_penyusun}</p>}

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

        {((aktif && aktif.status === 'draft') || mode === 'edit' || (!aktif && !ditetapkan)) && (
          <div className="flex flex-col gap-3">
            {aktif?.catatan_reviu && (
              <div className="flex items-start gap-2 rounded-[12px] bg-[var(--color-danger-soft)] p-3 text-[13px] text-[var(--color-danger)]">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>Catatan reviu sebelumnya:</strong> {aktif.catatan_reviu}</span>
              </div>
            )}
            {isStruktur ? (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-[var(--color-ink)]">Isi Bagian (Tabel Struktur)</p>
                <StrukturKurikulumEditor value={parseStruktur(konten)} onChange={(d) => setKonten(JSON.stringify(d))} editorKey={editorKey} />
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-[var(--color-ink)]">Isi Bagian</p>
                <RichTextEditor key={editorKey} value={konten} onChange={setKonten} />
              </div>
            )}
            <Textarea label="Catatan Penyusun (opsional)" rows={2} placeholder="Catatan untuk Yayasan saat mengajukan…" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => simpanDraft({ ajukan: false })} disabled={busy || kontenKosong}><PencilLine className="h-4 w-4" /> Simpan Draft</Button>
              <Button size="sm" onClick={() => simpanDraft({ ajukan: true })} disabled={busy || kontenKosong}><Send className="h-4 w-4" /> Ajukan ke Yayasan</Button>
              {aktif && aktif.status === 'draft' && (
                <Button size="sm" variant="ghost" onClick={hapusDraft} disabled={busy}><Trash2 className="h-4 w-4" /> Hapus Draft</Button>
              )}
              {mode === 'edit' && !aktif && (
                <Button size="sm" variant="ghost" onClick={() => setMode('view')} disabled={busy}>Batal</Button>
              )}
            </div>
          </div>
        )}

        {!aktif && ditetapkan && mode === 'view' && (
          <div className="flex flex-col gap-3">
            <EmptyState icon={FileSignature} title="Tidak ada ajuan berjalan" description="Isi resmi sudah ditetapkan. Buat revisi untuk mengajukan perubahan." />
            <div><Button size="sm" onClick={mulaiRevisi}><PencilLine className="h-4 w-4" /> Buat Revisi</Button></div>
          </div>
        )}
      </SectionCard>

      {riwayat.length > 0 && (
        <SectionCard title="Riwayat" description="Versi lama yang diarsipkan atau ajuan yang ditolak">
          <div className="flex flex-col gap-2.5">
            {riwayat.map((r) => (
              <div key={r.id} className="rounded-[12px] border border-[var(--color-border)] bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  <span className="text-[12px] text-[var(--color-ink-soft)]">Versi {r.versi} · {fmtTgl(r.direviu_at || r.updated_at)}{r.disusun_nama ? ` · ${r.disusun_nama}` : ''}</span>
                </div>
                {isStruktur
                  ? <p className="mt-2 text-[13px] text-[var(--color-ink-soft)]">{ringkasStruktur(r.konten) || '—'}</p>
                  : <p className="mt-2 line-clamp-3 text-[13px] text-[var(--color-ink-soft)]">{plainText(r.konten) || '—'}</p>}
                {r.catatan_reviu && <p className="mt-1 text-[12px] text-[var(--color-danger)]"><History className="mr-1 inline h-3 w-3" />{r.catatan_reviu}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
