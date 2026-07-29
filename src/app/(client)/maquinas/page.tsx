'use client'

import { useState, useEffect, useCallback } from 'react'

interface Esp32 {
  id: string
  serialNumber: string
  mqttTopic: string
  online: boolean
  lastSeen: string | null
  credits: number
  createdAt: string
}

interface Machine {
  id: string
  name: string
  location: string | null
  createdAt: string
  esps: Esp32[]
}

export default function MaquinasPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [showMachineModal, setShowMachineModal] = useState(false)
  const [showEspModal, setShowEspModal] = useState<string | null>(null)
  const [machineForm, setMachineForm] = useState({ name: '', location: '' })
  const [espForm, setEspForm] = useState({ serialNumber: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/machines')
    const data = await res.json()
    setMachines(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createMachine(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(machineForm),
    })
    if (res.ok) {
      setShowMachineModal(false)
      setMachineForm({ name: '', location: '' })
      load()
    } else {
      const d = await res.json()
      setError(d.error)
    }
    setSaving(false)
  }

  async function addEsp32(machineId: string) {
    setSaving(true)
    setError('')
    const res = await fetch('/api/esp32', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, serialNumber: espForm.serialNumber }),
    })
    if (res.ok) {
      setShowEspModal(null)
      setEspForm({ serialNumber: '' })
      load()
    } else {
      const d = await res.json()
      setError(d.error)
    }
    setSaving(false)
  }

  async function deleteEsp32(id: string) {
    if (!confirm('Remover este ESP32?')) return
    await fetch(`/api/esp32/${id}`, { method: 'DELETE' })
    load()
  }

  async function deleteMachine(id: string) {
    if (!confirm('Excluir esta máquina e todos os ESP32s vinculados?')) return
    await fetch(`/api/machines/${id}`, { method: 'DELETE' })
    load()
  }

  async function sendMqtt(topic: string, message: string) {
    await fetch('/api/mqtt/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, message }),
    })
    alert(`Comando enviado para ${topic}`)
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div><h1>Minhas Máquinas</h1><p>{machines.length} máquinas cadastradas</p></div>
        <button id="btn-new-machine" className="btn btn-primary" onClick={() => setShowMachineModal(true)}>
          ➕ Nova Máquina
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><span className="loading-spinner" /></div>
      ) : machines.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🖥️</div>
          <p>Nenhuma máquina cadastrada ainda.</p>
          <button className="btn btn-primary" onClick={() => setShowMachineModal(true)}>Criar primeira máquina</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {machines.map(m => (
            <div key={m.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>🖥️ {m.name}</div>
                  {m.location && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>📍 {m.location}</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowEspModal(m.id)}>➕ Adicionar ESP32</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteMachine(m.id)}>🗑️</button>
                </div>
              </div>

              {m.esps.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  Nenhum ESP32 vinculado ainda
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Serial</th><th>Tópico MQTT</th><th>Status</th><th>Créditos</th><th>Último contato</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                      {m.esps.map(e => (
                        <tr key={e.id}>
                          <td className="strong" style={{ fontFamily: 'monospace' }}>{e.serialNumber}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-light)' }}>{e.mqttTopic}</td>
                          <td>
                            {e.online ? (
                              <span className="badge online"><span className="pulse" style={{ marginRight: '4px' }} />Online</span>
                            ) : (
                              <span className="badge offline">Offline</span>
                            )}
                          </td>
                          <td className="strong" style={{ color: 'var(--accent-light)' }}>{e.credits.toFixed(2)}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            {e.lastSeen ? new Date(e.lastSeen).toLocaleString('pt-BR') : 'Nunca'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                title="Enviar ping"
                                onClick={() => sendMqtt(e.mqttTopic, JSON.stringify({ action: 'ping' }))}
                              >
                                📡 Ping
                              </button>
                              <a href={`/maquinas/${m.id}?esp=${e.id}`} className="btn btn-secondary btn-sm">Ver</a>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteEsp32(e.id)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Nova Máquina */}
      {showMachineModal && (
        <div className="modal-overlay" onClick={() => setShowMachineModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🖥️ Nova Máquina</span>
              <button className="modal-close" onClick={() => setShowMachineModal(false)}>×</button>
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <form onSubmit={createMachine}>
              <div className="form-group">
                <label className="form-label">Nome da máquina</label>
                <input id="machine-name" type="text" className="form-input" placeholder="Ex: Máquina Loja Centro" value={machineForm.name} onChange={e => setMachineForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Localização (opcional)</label>
                <input id="machine-location" type="text" className="form-input" placeholder="Ex: Rua das Flores, 123" value={machineForm.location} onChange={e => setMachineForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMachineModal(false)}>Cancelar</button>
                <button id="btn-save-machine" type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="loading-spinner" /> : '✅'} Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar ESP32 */}
      {showEspModal && (
        <div className="modal-overlay" onClick={() => setShowEspModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📡 Adicionar ESP32</span>
              <button className="modal-close" onClick={() => setShowEspModal(null)}>×</button>
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <div>
              <div className="form-group">
                <label className="form-label">Número de série do ESP32</label>
                <input
                  id="esp32-serial"
                  type="text"
                  className="form-input"
                  placeholder="Ex: ESP32-ABC123"
                  value={espForm.serialNumber}
                  onChange={e => setEspForm({ serialNumber: e.target.value })}
                  style={{ fontFamily: 'monospace' }}
                />
                <span className="form-hint">Este serial é gravado no firmware do seu ESP32</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEspModal(null)}>Cancelar</button>
                <button id="btn-save-esp32" className="btn btn-primary" disabled={saving} onClick={() => addEsp32(showEspModal)}>
                  {saving ? <span className="loading-spinner" /> : '✅'} Vincular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
