'use client'

import { useState, useEffect } from 'react'

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<{
    mpAccessToken: string
    mpWebhookSecret: string
    webhookToken: string
  } | null>(null)
  const [mpToken, setMpToken] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/client/settings').then(r => r.json()).then(d => {
      setSettings(d)
      setMpToken(d.mpAccessToken || '')
      setWebhookSecret(d.mpWebhookSecret || '')
      setLoading(false)
    })
  }, [])

  const webhookUrl = settings ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://hub.adapterco.com.br'}/api/webhook/${settings.webhookToken}` : ''

  async function copyUrl() {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function saveMpToken(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/client/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mpAccessToken: mpToken,
        mpWebhookSecret: webhookSecret,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return (
    <div className="page-content">
      <div style={{ textAlign: 'center', padding: '80px' }}><span className="loading-spinner" /></div>
    </div>
  )

  return (
    <div className="page-content">
      <div className="page-header">
        <div><h1>Configurações</h1><p>Integração com MercadoPago e webhook</p></div>
      </div>

      {/* Webhook URL */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-title">🔗 URL do Webhook MercadoPago</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Cole esta URL nas notificações do seu painel MercadoPago. Ela identifica sua conta de forma única.
        </p>
        <div className="copy-box">
          <input id="webhook-url" type="text" readOnly value={webhookUrl} />
          <button id="btn-copy-webhook" className="copy-btn" onClick={copyUrl}>
            {copied ? '✅ Copiado!' : '📋 Copiar'}
          </button>
        </div>
        <div className="alert alert-info" style={{ marginTop: '16px' }}>
          <span>ℹ️</span>
          <div>
            <strong>Como configurar:</strong> No painel do MercadoPago → Seu negócio → Configurações → Notificações (webhooks) → Cole a URL acima.
          </div>
        </div>
      </div>

      {/* MercadoPago Access Token */}
      <div className="card">
        <div className="section-title">🔑 Access Token MercadoPago</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Necessário para validar os pagamentos recebidos da sua máquina de cartão. Encontre em: Seu negócio → Credenciais → Access Token de Produção.
        </p>
        {saved && <div className="alert alert-success">✅ Token salvo com sucesso!</div>}
        <form onSubmit={saveMpToken}>
          <div className="form-group">
            <label className="form-label">Access Token</label>
            <input
              id="mp-access-token"
              type="password"
              className="form-input"
              placeholder="APP_USR-..."
              value={mpToken}
              onChange={e => setMpToken(e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
            <span className="form-hint">O token é armazenado de forma segura no servidor e nunca é exibido completo</span>
          </div>
          <div className="form-group">
            <label className="form-label">Assinatura secreta do webhook</label>
            <input
              id="mp-webhook-secret"
              type="password"
              className="form-input"
              placeholder="Assinatura secreta exibida pelo Mercado Pago"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
            <span className="form-hint">
              Usada para validar o cabeçalho x-signature de cada notificação.
            </span>
          </div>
          <button id="btn-save-token" type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="loading-spinner" /> : '💾'} Salvar Token
          </button>
        </form>
      </div>
    </div>
  )
}
