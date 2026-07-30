'use client'

import { useState, useEffect, useCallback } from 'react'

interface Esp32 {
  id: string
  serialNumber: string
  online: boolean
  lastSeen: string | null
  credits: number
}

interface Machine {
  id: string
  name: string
  location: string | null
  esps: Esp32[]
}

export default function MaquinasPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)

  // Modals state
  const [showAddMachine, setShowAddMachine] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [showEspModal, setShowEspModal] = useState<string | null>(null)

  // Form states
  const [machineName, setMachineName] = useState('')
  const [machineLocation, setMachineLocation] = useState('')
  const [espSerial, setEspSerial] = useState('')

  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/machines')
    const data = await res.json()
    setMachines(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createMachine(e: React.FormEvent) {
    e.preventDefault()
    if (!machineName) return
    setSaving(true)
    await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: machineName, location: machineLocation }),
    })
    setSaving(false)
    setShowAddMachine(false)
    setMachineName('')
    setMachineLocation('')
    load()
  }

  function openEditModal(m: Machine) {
    setEditingMachine(m)
    setMachineName(m.name)
    setMachineLocation(m.location || '')
  }

  async function updateMachine(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMachine || !machineName) return
    setSaving(true)
    const res = await fetch(`/api/machines/${editingMachine.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: machineName, location: machineLocation }),
    })
    if (!res.ok) {
      const d = await res.json()
      alert(d.error || 'Erro ao editar máquina')
    }
    setSaving(false)
    setEditingMachine(null)
    setMachineName('')
    setMachineLocation('')
    load()
  }

  async function addEsp32(machineId: string) {
    if (!espSerial) return
    setSaving(true)
    const res = await fetch('/api/esp32', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, serialNumber: espSerial }),
    })
    if (!res.ok) {
      const d = await res.json()
      alert(d.error || 'Erro ao vincular dispositivo')
    }
    setSaving(false)
    setShowEspModal(null)
    setEspSerial('')
    load()
  }

  async function deleteEsp32(id: string) {
    if (!confirm('Remover este dispositivo?')) return
    await fetch(`/api/esp32/${id}`, { method: 'DELETE' })
    load()
  }

  async function deleteMachine(id: string) {
    if (!confirm('Excluir esta máquina e todos os dispositivos vinculados?')) return
    await fetch(`/api/machines/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Minhas Máquinas</h1>
          <p>Gerencie suas máquinas e dispositivos cadastrados</p>
        </div>
        <button id="btn-add-machine" className="btn btn-primary" onClick={() => { setMachineName(''); setMachineLocation(''); setShowAddMachine(true); }}>
          ➕ Nova Máquina
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><span className="loading-spinner" /></div>
      ) : machines.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🖥️</div>
          <p>Nenhuma máquina cadastrada ainda.</p>
          <button className="btn btn-primary" onClick={() => { setMachineName(''); setMachineLocation(''); setShowAddMachine(true); }}>Cadastrar primeira máquina</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {machines.map(m => (
            <div key={m.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text-primary)' }}>🖥️ {m.name}</div>
                  {m.location && <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>📍 {m.location}</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={`/maquinas/${m.id}`} className="btn btn-secondary btn-sm">👁️ Detalhes</a>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(m)}>✏️ Editar</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowEspModal(m.id)}>➕ Adicionar Dispositivo</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteMachine(m.id)}>🗑️ Excluir</button>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }} />

              {m.esps.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Nenhum dispositivo vinculado ainda
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    📡 Dispositivos vinculados:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {m.esps.map(e => (
                      <div
                        key={e.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--bg-secondary)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {e.online ? (
                            <span className="badge online"><span className="pulse" /> Online</span>
                          ) : (
                            <span className="badge offline">Offline</span>
                          )}
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                            IDMAQ: {e.serialNumber}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Créditos: <strong style={{ color: 'var(--accent-light)' }}>{Number(e.credits).toFixed(0)}</strong>
                          </div>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteEsp32(e.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Nova Máquina */}
      {showAddMachine && (
        <div className="modal-overlay" onClick={() => setShowAddMachine(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🖥️ Nova Máquina</span>
              <button className="modal-close" onClick={() => setShowAddMachine(false)}>×</button>
            </div>
            <form onSubmit={createMachine}>
              <div className="form-group">
                <label className="form-label">Nome da Máquina</label>
                <input
                  id="machine-name"
                  type="text"
                  className="form-input"
                  placeholder="Ex: Máquina 01 - Loja Centro"
                  value={machineName}
                  onChange={e => setMachineName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Localização (opcional)</label>
                <input
                  id="machine-location"
                  type="text"
                  className="form-input"
                  placeholder="Ex: Av. Principal, 100"
                  value={machineLocation}
                  onChange={e => setMachineLocation(e.target.value)}
                />
              </div>
              <button id="btn-save-machine" type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading-spinner" /> : '💾'} Criar Máquina
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Máquina */}
      {editingMachine && (
        <div className="modal-overlay" onClick={() => setEditingMachine(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Editar Máquina</span>
              <button className="modal-close" onClick={() => setEditingMachine(null)}>×</button>
            </div>
            <form onSubmit={updateMachine}>
              <div className="form-group">
                <label className="form-label">Nome da Máquina</label>
                <input
                  id="edit-machine-name"
                  type="text"
                  className="form-input"
                  placeholder="Ex: Máquina 01 - Loja Centro"
                  value={machineName}
                  onChange={e => setMachineName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Localização (opcional)</label>
                <input
                  id="edit-machine-location"
                  type="text"
                  className="form-input"
                  placeholder="Ex: Av. Principal, 100"
                  value={machineLocation}
                  onChange={e => setMachineLocation(e.target.value)}
                />
              </div>
              <button id="btn-update-machine" type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading-spinner" /> : '💾'} Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Dispositivo */}
      {showEspModal && (
        <div className="modal-overlay" onClick={() => setShowEspModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📡 Adicionar Dispositivo</span>
              <button className="modal-close" onClick={() => setShowEspModal(null)}>×</button>
            </div>
            <div>
              <div className="form-group">
                <label className="form-label">Código do Dispositivo (IDMAQ)</label>
                <input
                  id="esp32-serial"
                  type="text"
                  className="form-input"
                  placeholder="Ex: ADP-001"
                  value={espSerial}
                  onChange={e => setEspSerial(e.target.value)}
                  style={{ fontFamily: 'monospace' }}
                />
                <span className="form-hint">Este código está impresso na etiqueta do seu dispositivo</span>
              </div>
              <button id="btn-save-esp32" className="btn btn-primary" disabled={saving} onClick={() => addEsp32(showEspModal)}>
                {saving ? <span className="loading-spinner" /> : '🔗'} Vincular Dispositivo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
