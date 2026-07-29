'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegistroPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', idmaq: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    if (form.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        idmaq: form.idmaq.trim().toUpperCase(),
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Erro ao criar conta.')
      setLoading(false)
    } else {
      router.push('/login?registered=1')
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-bg">
        <div className="auth-bg-blob b1" />
        <div className="auth-bg-blob b2" />
      </div>

      <div className="auth-card" style={{ maxWidth: '500px' }}>
        <div className="auth-logo">
          <div className="auth-logo-icon">📡</div>
          <span className="auth-logo-text">AdapterHub</span>
        </div>

        <h1 className="auth-title">Criar conta</h1>
        <p className="auth-subtitle">Você precisará do código do seu dispositivo AdapterCo</p>

        {error && (
          <div className="alert alert-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">🏷️ Código do Dispositivo (IDMAQ)</label>
            <input
              id="idmaq"
              type="text"
              className="form-input"
              placeholder="Ex: ADP-001"
              value={form.idmaq}
              onChange={e => setField('idmaq', e.target.value)}
              required
              autoComplete="off"
              style={{ fontFamily: 'monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}
            />
            <span className="form-hint">Código impresso no seu dispositivo AdapterCo</span>
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />

          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input
              id="name"
              type="text"
              className="form-input"
              placeholder="Seu nome ou empresa"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              id="reg-email"
              type="email"
              className="form-input"
              placeholder="seu@email.com"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input
                id="reg-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setField('password', e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar senha</label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={e => setField('confirmPassword', e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            id="btn-register"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '4px' }}
            disabled={loading}
          >
            {loading ? <span className="loading-spinner" /> : '🚀'} Criar conta
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '20px' }}>
          Já tem conta?{' '}
          <a href="/login" style={{ color: 'var(--accent-light)', fontWeight: 600, textDecoration: 'none' }}>
            Entrar
          </a>
        </p>
      </div>
    </div>
  )
}
