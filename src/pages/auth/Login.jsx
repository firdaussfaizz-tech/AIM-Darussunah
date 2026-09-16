import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { Button, Input } from '../../components/ui'

export default function Login() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    const redirectTo = location.state?.from || '/'
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        navigate('/', { replace: true })
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (err) throw err
        setInfo('Akun berhasil dibuat. Silakan hubungi admin yayasan untuk diberikan akses/peran, lalu masuk (login).')
        setMode('signin')
      }
    } catch (err) {
      setError(mapError(err.message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-[var(--color-navy)]">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-tight text-[var(--color-ink)]">SIMPEG Yayasan</h1>
          <p className="mt-1.5 text-[15px] text-[var(--color-ink-soft)]">Sistem Informasi Kepegawaian — SD · SMP · SMA</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-sm">
          <h2 className="mb-5 text-[17px] font-semibold text-[var(--color-ink)]">
            {mode === 'signin' ? 'Masuk ke akun Anda' : 'Buat akun baru'}
          </h2>

          {mode === 'signup' && (
            <Input
              label="Nama lengkap"
              containerClassName="mb-4"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Nama sesuai identitas kepegawaian"
            />
          )}
          <Input
            label="Email"
            type="email"
            containerClassName="mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="nama@yayasan.sch.id"
          />
          <Input
            label="Kata sandi"
            type="password"
            containerClassName="mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="Minimal 6 karakter"
          />

          {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          {info && <p className="mt-3 rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">{info}</p>}

          <Button type="submit" className="mt-5 w-full" disabled={submitting}>
            {submitting ? 'Memproses…' : mode === 'signin' ? 'Masuk' : 'Daftar'}
          </Button>

          <p className="mt-4 text-center text-sm text-[var(--color-ink-soft)]">
            {mode === 'signin' ? (
              <>
                Belum punya akun?{' '}
                <button type="button" onClick={() => setMode('signup')} className="font-medium text-[var(--color-navy)] hover:underline">
                  Daftar
                </button>
              </>
            ) : (
              <>
                Sudah punya akun?{' '}
                <button type="button" onClick={() => setMode('signin')} className="font-medium text-[var(--color-navy)] hover:underline">
                  Masuk
                </button>
              </>
            )}
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-[var(--color-ink-soft)]">
          Akun baru belum memiliki akses apa pun sampai diberi peran oleh Admin Yayasan.
        </p>
      </div>
    </div>
  )
}

function mapError(message = '') {
  if (message.includes('Invalid login credentials')) return 'Email atau kata sandi salah.'
  if (message.includes('User already registered')) return 'Email ini sudah terdaftar. Silakan masuk.'
  if (message.includes('Password should be')) return 'Kata sandi minimal 6 karakter.'
  return message
}
