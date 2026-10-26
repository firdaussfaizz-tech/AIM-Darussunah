import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { SectionCard, Badge, Table, Tr, Td, FullPageSpinner, StatCard, EmptyState } from '../../components/ui'
import { BULAN, formatRupiah, formatDate, STATUS_BADGE_COLOR, SPP_TAGIHAN_STATUS_LABELS } from '../../lib/format'
import { PROGRAM_LABEL, PROGRAM_BADGE, KOMPONEN_SPP } from '../../lib/uangPangkal'

// Tab "Tagihan (akumulatif) & Riwayat Pembayaran" di detail siswa.
// Menggabungkan Uang Pangkal + SPP milik siswa (read-only). Pengelolaan
// pembayaran tetap di modul Uang Pangkal / SPP.
export default function StudentTagihanTab({ siswaId }) {
  const [loading, setLoading] = useState(true)
  const [sppTagihan, setSppTagihan] = useState([])
  const [sppBayar, setSppBayar] = useState({})
  const [upTagihan, setUpTagihan] = useState([])
  const [upBayar, setUpBayar] = useState({})
  const [upBayarRows, setUpBayarRows] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: spp }, { data: up }] = await Promise.all([
      supabase.from('spp_tagihan').select('*, tahun_ajaran(nama)').eq('siswa_id', siswaId).order('tahun', { ascending: false }).order('bulan', { ascending: false }),
      supabase.from('up_tagihan').select('*, tahun_ajaran(nama), up_tagihan_item(*)').eq('siswa_id', siswaId).order('created_at', { ascending: false }),
    ])
    const sppIds = (spp || []).map((t) => t.id)
    const upIds = (up || []).map((t) => t.id)
    const sb = {}; const ub = {}; const ubr = {}
    if (sppIds.length) {
      const { data: p } = await supabase.from('spp_pembayaran').select('tagihan_id, nominal_dibayar').in('tagihan_id', sppIds)
      for (const r of p || []) sb[r.tagihan_id] = (sb[r.tagihan_id] || 0) + Number(r.nominal_dibayar || 0)
    }
    if (upIds.length) {
      const { data: p } = await supabase.from('up_pembayaran').select('*').in('tagihan_id', upIds).order('tanggal_bayar', { ascending: false })
      for (const r of p || []) {
        ub[r.tagihan_id] = (ub[r.tagihan_id] || 0) + Number(r.nominal_dibayar || 0)
        ;(ubr[r.tagihan_id] = ubr[r.tagihan_id] || []).push(r)
      }
    }
    setSppTagihan(spp || []); setSppBayar(sb)
    setUpTagihan(up || []); setUpBayar(ub); setUpBayarRows(ubr)
    setLoading(false)
  }, [siswaId])
  useEffect(() => { load() }, [load])

  if (loading) return <FullPageSpinner />

  const sppTotal = sppTagihan.reduce((s, t) => s + Number(t.nominal_tagihan || 0), 0)
  const sppBayarTotal = sppTagihan.reduce((s, t) => s + (sppBayar[t.id] || 0), 0)
  const upTotal = upTagihan.reduce((s, t) => s + Number(t.nominal_tagihan || 0), 0)
  const upBayarTotal = upTagihan.reduce((s, t) => s + (upBayar[t.id] || 0), 0)
  const totalTagihan = sppTotal + upTotal
  const totalDibayar = sppBayarTotal + upBayarTotal
  const tunggakan = Math.max(0, totalTagihan - totalDibayar)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Tagihan" value={formatRupiah(totalTagihan)} accent="navy" />
        <StatCard label="Total Dibayar" value={formatRupiah(totalDibayar)} accent="success" />
        <StatCard label="Tunggakan" value={formatRupiah(tunggakan)} accent="danger" />
        <StatCard label="Uang Pangkal / SPP" value={`${formatRupiah(upTotal)} / ${formatRupiah(sppTotal)}`} />
      </div>

      <SectionCard title="Uang Pangkal" description="Tagihan sekali saat masuk (rincian komponen & riwayat pembayaran).">
        {upTagihan.length === 0 ? <EmptyState title="Belum ada tagihan uang pangkal" description="Tagihan dibuat dari menu Uang Pangkal." /> : (
          <div className="flex flex-col gap-4">
            {upTagihan.map((t) => {
              const dibayar = upBayar[t.id] || 0
              const sisa = Math.max(0, Number(t.nominal_tagihan || 0) - dibayar)
              const items = (t.up_tagihan_item || []).slice().sort((a, b) => a.urutan - b.urutan)
              return (
                <div key={t.id} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--color-ink)]">TA {t.tahun_ajaran?.nama || '—'}</span>
                      <Badge color={PROGRAM_BADGE[t.program]}>{PROGRAM_LABEL[t.program]}</Badge>
                      <Badge color={STATUS_BADGE_COLOR[t.status]}>{SPP_TAGIHAN_STATUS_LABELS[t.status]}</Badge>
                    </div>
                    <div className="text-sm text-[var(--color-ink-soft)]">Dibayar {formatRupiah(dibayar)} / {formatRupiah(t.nominal_tagihan)}{sisa > 0 && <span className="text-[var(--color-danger)]"> · sisa {formatRupiah(sisa)}</span>}</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Rincian Komponen</p>
                      <div className="flex flex-col gap-1 text-sm">
                        {items.map((it) => (
                          <div key={it.id} className="flex justify-between">
                            <span className="text-[var(--color-ink-soft)]">{it.komponen}{it.komponen === KOMPONEN_SPP && t.spp_bulan ? ` (${BULAN[t.spp_bulan - 1]} ${t.spp_tahun})` : ''}</span>
                            <span>{formatRupiah(it.nominal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Riwayat Pembayaran</p>
                      {(upBayarRows[t.id] || []).length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada pembayaran.</p> : (
                        <div className="flex flex-col gap-1 text-sm">
                          {(upBayarRows[t.id] || []).map((p) => (
                            <div key={p.id} className="flex justify-between">
                              <span className="text-[var(--color-ink-soft)]">{formatDate(p.tanggal_bayar)} · {p.metode || '—'}</span>
                              <span className="text-[var(--color-success)]">{formatRupiah(p.nominal_dibayar)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="SPP Bulanan" description="Rekap tagihan SPP per periode.">
        {sppTagihan.length === 0 ? <EmptyState title="Belum ada tagihan SPP" description="Tagihan dibuat dari menu SPP." /> : (
          <Table columns={['Periode', 'Tahun Ajaran', 'Tagihan', 'Dibayar', 'Status']}>
            {sppTagihan.map((t) => {
              const d = sppBayar[t.id] || 0
              return (
                <Tr key={t.id}>
                  <Td className="font-medium">{BULAN[t.bulan - 1]} {t.tahun}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{t.tahun_ajaran?.nama || '—'}</Td>
                  <Td>{formatRupiah(t.nominal_tagihan)}</Td>
                  <Td className="text-[var(--color-success)]">{formatRupiah(d)}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[t.status]}>{SPP_TAGIHAN_STATUS_LABELS[t.status]}</Badge></Td>
                </Tr>
              )
            })}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}
