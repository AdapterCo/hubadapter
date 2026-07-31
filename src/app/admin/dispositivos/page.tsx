'use client'

import { useState, useEffect, useCallback } from 'react'

interface Device {
  id: string
  idmaq: string
  claimed: boolean
  createdAt: string
  client?: { name: string; email: string } | null
}

export default function DispositivosPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'free' | 'claimed'>('all')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/devices')
    const data = await res.json()
    setDevices(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAutoGenerate(count: 1 | 10 | 30) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateCount: count }),
      })
      if (res.ok) {
        setShowModal(false)
        load()
      } else {
        const d = await res.json()
        setError(d.error || 'Erro ao gerar dispositivos')
      }
    } catch {
      setError('Erro de comunicação ao gerar dispositivos.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const idmaqs = bulkInput.split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    const res = await fetch('/api/admin/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idmaqs }),
    })
    if (res.ok) {
      setShowModal(false)
      setBulkInput('')
      load()
    } else {
      const d = await res.json()
      setError(d.error || 'Erro ao adicionar')
    }
    setSaving(false)
  }

  async function resetDevice(id: string) {
    if (!confirm('Resetar este dispositivo? O cliente atual perderá o vínculo.')) return
    await fetch(`/api/admin/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    })
    load()
  }

  async function deleteDevice(id: string) {
    if (!confirm('Excluir este dispositivo?')) return
    await fetch(`/api/admin/devices/${id}`, { method: 'DELETE' })
    load()
  }

  const filtered = devices.filter(d =>
    filter === 'all' ? true :
    filter === 'free' ? !d.claimed :
    d.claimed
  )

  const freeCount = devices.filter(d => !d.claimed).length
  const claimedCount = devices.filter(d => d.claimed).length

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Dispositivos (IDMAQ)</h1>
          <p>{devices.length} total — {freeCount} livres — {claimedCount} vinculados</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => handleAutoGenerate(1)} disabled={saving}>
            🎲 Gerar 1 IDMAQ
          </button>
          <button className="btn btn-secondary" onClick={() => handleAutoGenerate(10)} disabled={saving}>
            🎲 Gerar 10 IDMAQs
          </button>
          <button className="btn btn-secondary" onClick={() => handleAutoGenerate(30)} disabled={saving}>
            🎲 Gerar 30 IDMAQs
          </button>
          <button id="btn-add-device" className="btn btn-primary" onClick={() => setShowModal(true)}>
            ➕ Adicionar Manual
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['all', 'free', 'claimed'] as const).map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `Todos (${devices.length})` : f === 'free' ? `Livres (${freeCount})` : `Vinculados (${claimedCount})`}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <p>Nenhum dispositivo cadastrado.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
              <button className="btn btn-primary" onClick={() => handleAutoGenerate(10)}>🎲 Gerar 10 IDMAQs Automáticos</button>
              <button className="btn btn-secondary" onClick={() => setShowModal(true)}>Adicionar Manualmente</button>
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>IDMAQ</th><th>Status</th><th>Cliente</th><th>Cadastrado</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td className="strong" style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{d.idmaq}</td>
                    <td>
                      <span className={`badge ${d.claimed ? 'approved' : 'pending'}`}>
                        {d.claimed ? '🔗 Vinculado' : '⬡ Livre'}
                      </span>
                    </td>
                    <td>{d.client ? `${d.client.name} (${d.client.email})` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {d.claimed && (
                          <button className="btn btn-secondary btn-sm" onClick={() => resetDevice(d.id)}>🔄 Reset</button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={() => deleteDevice(d.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📦 Adicionar Dispositivos</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}

            {/* Gerador Automático Rápido */}
            <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                🎲 Gerador Automático em Lote (10 Caracteres)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleAutoGenerate(1)} disabled={saving}>
                  + 1 IDMAQ
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleAutoGenerate(10)} disabled={saving}>
                  + 10 IDMAQs
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleAutoGenerate(30)} disabled={saving}>
                  + 30 IDMAQs
                </button>
              </div>
            </div>

            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label className="form-label">Ou digite manualmente os códigos IDMAQ</label>
                <textarea
                  id="idmaq-input"
                  className="form-textarea"
                  placeholder="ADP8K3X9L2&#10;ADP4M7N1Q5&#10;ADP9P2R6T8&#10;&#10;(Um por linha, ou separados por vírgula)"
                  value={bulkInput}
                  onChange={e => setBulkInput(e.target.value)}
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button id="btn-save-devices" type="submit" className="btn btn-primary" disabled={saving || !bulkInput.trim()}>
                  {saving ? <span className="loading-spinner" /> : '✅'} Salvar Manuais
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
