import { useRef, useEffect } from 'react'
import { Bold, Italic, Underline, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Link2, RemoveFormatting } from 'lucide-react'

// ============================================================================
// Editor teks kaya (WYSIWYG) ringan ala Microsoft Word — tanpa dependensi
// eksternal. Memakai contentEditable + document.execCommand. Konten disimpan
// sebagai HTML (string) di kolom `konten`. Dipakai untuk semua "isi bagian
// khusus teks" pada sistem pembangun kurikulum.
//
// Catatan: parent me-remount editor via prop `key` saat bagian/revisi berganti
// sehingga innerHTML diinisialisasi ulang tanpa mengganggu posisi kursor
// ketika mengetik.
// ============================================================================

const RTE_CSS = `
.rte-content { font-size:14px; line-height:1.65; color:var(--color-ink); }
.rte-content:focus { outline:none; }
.rte-content h1 { font-size:1.5em; font-weight:700; margin:.6em 0 .3em; }
.rte-content h2 { font-size:1.25em; font-weight:700; margin:.6em 0 .3em; }
.rte-content h3 { font-size:1.1em; font-weight:600; margin:.5em 0 .25em; }
.rte-content p { margin:.4em 0; }
.rte-content ul { list-style:disc; padding-left:1.5em; margin:.4em 0; }
.rte-content ol { list-style:decimal; padding-left:1.5em; margin:.4em 0; }
.rte-content li { margin:.15em 0; }
.rte-content blockquote { border-left:3px solid var(--color-border); padding-left:.9em; margin:.5em 0; color:var(--color-ink-soft); font-style:italic; }
.rte-content a { color:var(--color-navy); text-decoration:underline; }
.rte-content b, .rte-content strong { font-weight:700; }
.rte-content:empty::before { content:attr(data-placeholder); color:var(--color-ink-soft); }
`

function ensureRteStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('rte-styles')) return
  const el = document.createElement('style')
  el.id = 'rte-styles'
  el.textContent = RTE_CSS
  document.head.appendChild(el)
}

// Sanitasi ringan untuk menampilkan HTML tersimpan (penulis = staf internal
// tepercaya, tapi tetap buang script/handler agar aman).
export function sanitizeHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2')
}

export const htmlKosong = (html) => !html || !String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()

const TOOLBAR = [
  { cmd: 'bold', icon: Bold, title: 'Tebal' },
  { cmd: 'italic', icon: Italic, title: 'Miring' },
  { cmd: 'underline', icon: Underline, title: 'Garis bawah' },
  { cmd: 'strikeThrough', icon: Strikethrough, title: 'Coret' },
  { block: '<h2>', icon: Heading2, title: 'Judul 2' },
  { block: '<h3>', icon: Heading3, title: 'Judul 3' },
  { cmd: 'insertUnorderedList', icon: List, title: 'Daftar poin' },
  { cmd: 'insertOrderedList', icon: ListOrdered, title: 'Daftar nomor' },
  { block: '<blockquote>', icon: Quote, title: 'Kutipan' },
  { link: true, icon: Link2, title: 'Tautan' },
  { cmd: 'removeFormat', icon: RemoveFormatting, title: 'Hapus format' },
]

export function RichTextEditor({ value, onChange, placeholder = 'Tulis isi bagian ini sesuai panduan di atas…' }) {
  const ref = useRef(null)

  useEffect(() => {
    ensureRteStyles()
    if (ref.current) ref.current.innerHTML = value || ''
    // Inisialisasi sekali saat mount (parent remount via key bila berganti bagian).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML) }

  const run = (item) => {
    if (!ref.current) return
    ref.current.focus()
    if (item.link) {
      const url = window.prompt('Masukkan URL tautan:')
      if (url) document.execCommand('createLink', false, url)
    } else if (item.block) {
      document.execCommand('formatBlock', false, item.block)
    } else {
      document.execCommand(item.cmd, false, null)
    }
    emit()
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-paper)] p-1.5">
        {TOOLBAR.map((item, i) => {
          const Icon = item.icon
          return (
            <button
              key={i}
              type="button"
              title={item.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(item)}
              className="btn-press flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--color-ink)] hover:bg-white"
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
      <div
        ref={ref}
        className="rte-content min-h-[180px] px-3.5 py-2.5"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}

export function RichTextView({ html }) {
  useEffect(() => { ensureRteStyles() }, [])
  if (htmlKosong(html)) return <p className="text-[13px] text-[var(--color-ink-soft)]">—</p>
  return <div className="rte-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
}
