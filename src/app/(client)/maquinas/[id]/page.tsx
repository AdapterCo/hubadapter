'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Esp32ActivityReport from '@/components/Esp32ActivityReport'

interface Esp32 {
  id: string
  serialNumber: string
  mqttTopic: string
  online: boolean
  lastSeen: string | null
  credits: number
  mpPosId: string | null
  mpPosName: string | null
}

interface Machine {
  id: string
  name: string
  location: string | null
  esps: Esp32[]
}

interface MpPosDevice {
  id: string
  name: string
  operating_mode?: string
  model?: string
}

export default function MachineDetailPage() {
  const params = useParams()
  const machineId = params.id as string

  const [machine, setMachine] = useState<Machine | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [machineName, setMachineName] = useState('')
  const [machineLocation, setMachineLocation] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Feedback banner state for active ping/credit tests
  const [testFeedback, setTestFeedback] = useState<{ espId: string; type: 'success' | 'error'; message: string } | null>(null)
  const [testingEspId, setTestingEspId] = useState<string | null>(null)

  // Binding Modal state
  const [activeEsp, setActiveEsp] = useState<Esp32 | null>(null)
  const [mpDevices, setMpDevices] = useState<MpPosDevice[]>([])
  const [loadingMp, setLoadingMp] = useState(false)
  const [mpError, setMpError] = useState<string | null>(null)
  const [binding, setBinding] = useState(false)
  const [needsConfig, setNeedsConfig] = useState(false)

  const loadMachine = useCallback(async () => {
    const res = await fetch(`/api/machines/${machineId}`)
    if (res.ok) {
      const data = await res.json()
      setMachine(data)
    }
    setLoading(false)
  }, [machineId])

  useEffect(() => {
    loadMachine()
    const interval = setInterval(loadMachine, 15000)
    return () => clearInterval(interval)
  }, [loadMachine])

  function openEditModal() {
    if (!machine) return
    setMachineName(machine.name)
    setMachineLocation(machine.location || '')
    setShowEditModal(true)
  }

  async function handleUpdateMachine(e: React.FormEvent) {
    e.preventDefault()
    if (!machine || !machineName) return
    setSavingEdit(true)
    const res = await fetch(`/api/machines/${machine.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: machineName, location: machineLocation }),
    })
    if (res.ok) {
      setShowEditModal(false)
      loadMachine()
    } else {
      const d = await res.json()
      alert(d.error || 'Erro ao atualizar máquina')
    }
    setSavingEdit(false)
  }

  async function openBindModal(esp: Esp32) {
    setActiveEsp(esp)
    setLoadingMp(true)
    setMpError(null)
    setNeedsConfig(false)
    setMpDevices([])

    try {
      const res = await fetch('/api/mercadopago/devices')
      const data = await res.json()

      if (!res.ok) {
        setMpError(data.error || 'Erro ao buscar máquinas do Mercado Pago.')
        if (data.needsConfig) {
          setNeedsConfig(true)
        }
      } else {
        setMpDevices(data.devices || [])
      }
    } catch {
      setMpError('Erro de conexão ao buscar máquinas.')
    } finally {
      setLoadingMp(false)
    }
  }

  async function handleBind(mpPosId: string | null, mpPosName: string | null) {
    if (!activeEsp) return
    setBinding(true)

    try {
      const res = await fetch('/api/mercadopago/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          esp32Id: activeEsp.id,
          mpPosId,
          mpPosName,
        }),
      })

      if (res.ok) {
        setActiveEsp(null)
        loadMachine()
      } else {
        const d = await res.json()
        alert(d.error || 'Erro ao vincular máquina')
      }
    } catch {
      alert('Erro de conexão ao vincular.')
    } finally {
      setBinding(false)
    }
  }

  async function sendMqttCommand(esp32Id: string, action: 'ping' | 'credit_test') {
    setTestingEspId(esp32Id)
    setTestFeedback(null)

    const beforeTime = Date.now()

    try {
      const res = await fetch('/api/mqtt/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          esp32Id,
          action,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setTestFeedback({
          espId: esp32Id,
          type: 'error',
          message: `Falha ao enviar comando ao dispositivo: ${errData.error || 'Erro desconhecido'}`,
        })
        setTestingEspId(null)
        return
      }

      if (action === 'ping') {
        let ackReceived = false
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(r => setTimeout(r, 1000))
          const checkRes = await fetch(`/api/machines/${machineId}`)
          if (checkRes.ok) {
            const data: Machine = await checkRes.json()
            setMachine(data)
            const targetEsp = data.esps.find(e => e.id === esp32Id)
            if (targetEsp?.lastSeen && new Date(targetEsp.lastSeen).getTime() >= beforeTime - 1000) {
              ackReceived = true
              break
            }
          }
        }

        if (ackReceived) {
          setTestFeedback({
            espId: esp32Id,
            type: 'success',
            message: '🟢 Dispositivo respondeu ao Teste de Conexão! O equipamento está ONLINE e pronto.',
          })
        } else {
          setTestFeedback({
            espId: esp32Id,
            type: 'error',
            message: '🔴 O Dispositivo NÃO respondeu ao Teste. Verifique a alimentação e conexão com a internet.',
          })
        }
      } else {
        setTestFeedback({
          espId: esp32Id,
          type: 'success',
          message: '⚡ Comando de teste de crédito (+ 1 crédito inteiro) enviado ao dispositivo com sucesso!',
        })
        loadMachine()
      }
    } catch {
      setTestFeedback({
        espId: esp32Id,
        type: 'error',
        message: 'Erro de comunicação ao testar dispositivo.',
      })
    } finally {
      setTestingEspId(null)
    }
  }

  if (loading) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '80px' }}><span className="loading-spinner" /></div>
      </div>
    )
  }

  if (!machine) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <h2>Máquina não encontrada</h2>
          <a href="/maquinas" className="btn btn-secondary" style={{ marginTop: '16px' }}>⬅️ Voltar para Minhas Máquinas</a>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>🖥️ {machine.name}</h1>
          <p>{machine.location ? `📍 ${machine.location}` : 'Sem localização definida'}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={openEditModal}>✏️ Editar Máquina</button>
          <a href="/maquinas" className="btn btn-secondary">⬅️ Voltar</a>
        </div>
      </div>

      <div className="section-title">📡 Dispositivo (IDMAQ) Vinculado</div>

      {machine.esps.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <p>Nenhum dispositivo vinculado a esta máquina.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {machine.esps.map(esp => (
            <div key={esp.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    🏷️ IDMAQ: {esp.serialNumber}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {esp.online ? (
                    <span className="badge online"><span className="pulse" /> Online</span>
                  ) : (
                    <span className="badge offline">Offline</span>
                  )}
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />

              {/* Mercado Pago POS Card Machine Binding Info */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      💳 Máquina de Cartão Mercado Pago Vinculada
                    </div>
                    {esp.mpPosId ? (
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                        ✅ Terminal: {esp.mpPosId}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--warning)', marginTop: '4px' }}>
                        ⚠️ Nenhuma máquina de cartão do Mercado Pago vinculada a este dispositivo
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => openBindModal(esp)}
                    id={`btn-bind-mp-${esp.id}`}
                  >
                    🔄 {esp.mpPosId ? 'Alterar Maquininha MP' : 'Buscar & Vincular Maquininha MP'}
                  </button>
                </div>
              </div>

              {/* Activity & Uptime Report Component */}
              <Esp32ActivityReport
                serialNumber={esp.serialNumber}
                lastSeen={esp.lastSeen}
                online={esp.online}
                mqttTopic={esp.mqttTopic}
                credits={esp.credits}
              />

              {/* Feedback alert for testing commands */}
              {testFeedback && testFeedback.espId === esp.id && (
                <div className={`alert alert-${testFeedback.type}`} style={{ marginTop: '16px' }}>
                  {testFeedback.message}
                </div>
              )}

              {/* Actions & Credits */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Créditos Inteiros Liberados: </span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-light)' }}>
                    {Number(esp.credits).toFixed(0)} crédito(s)
                  </span>
                  {esp.lastSeen && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Última comunicação: {new Date(esp.lastSeen).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={testingEspId === esp.id}
                    onClick={() => sendMqttCommand(esp.id, 'ping')}
                  >
                    {testingEspId === esp.id ? <span className="loading-spinner" /> : '📡 Testar Conexão'}
                  </button>
                  <button
                    className="btn btn-success btn-sm"
                    disabled={testingEspId === esp.id}
                    onClick={() => sendMqttCommand(esp.id, 'credit_test')}
                  >
                    ⚡ Teste de Crédito (+ 1 Crédito)
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Editar Máquina */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Editar Máquina</span>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleUpdateMachine}>
              <div className="form-group">
                <label className="form-label">Nome da Máquina</label>
                <input
                  id="detail-edit-name"
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
                  id="detail-edit-location"
                  type="text"
                  className="form-input"
                  placeholder="Ex: Av. Principal, 100"
                  value={machineLocation}
                  onChange={e => setMachineLocation(e.target.value)}
                />
              </div>
              <button id="btn-save-detail-edit" type="submit" className="btn btn-primary" disabled={savingEdit}>
                {savingEdit ? <span className="loading-spinner" /> : '💾'} Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Vincular Maquininha Mercado Pago */}
      {activeEsp && (
        <div className="modal-overlay" onClick={() => setActiveEsp(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💳 Vincular Máquina de Cartão Mercado Pago</span>
              <button className="modal-close" onClick={() => setActiveEsp(null)}>×</button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Vinculando ao Dispositivo <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{activeEsp.serialNumber}</strong>.
            </p>

            {loadingMp ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <span className="loading-spinner" /><br />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                  Consultando máquinas (terminals/v1/list) cadastradas no seu Mercado Pago...
                </span>
              </div>
            ) : mpError ? (
              <div>
                <div className="alert alert-error">
                  <span>⚠️</span> {mpError}
                </div>
                {needsConfig && (
                  <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    <a href="/configuracoes" className="btn btn-primary">
                      ⚙️ Ir para Configurações & Salvar Token MP
                    </a>
                  </div>
                )}
              </div>
            ) : mpDevices.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 10px' }}>
                <div className="empty-icon">💳</div>
                <p>Nenhuma máquina de cartão (Point/POS) encontrada na sua conta do Mercado Pago.</p>
                <div className="alert alert-info" style={{ textAlign: 'left', marginTop: '12px' }}>
                  <span>ℹ️</span> Certifique-se de que sua maquininha Point Smart / Point Pro está ligada e cadastrada no seu aplicativo do Mercado Pago.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                {mpDevices.map(dev => (
                  <div
                    key={dev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: activeEsp.mpPosId === dev.id ? 'rgba(124, 58, 237, 0.15)' : 'var(--bg-secondary)',
                      border: activeEsp.mpPosId === dev.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                        💳 {dev.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                        ID Terminal: {dev.id} {dev.operating_mode ? `• Modo: ${dev.operating_mode}` : ''}
                      </div>
                    </div>

                    {activeEsp.mpPosId === dev.id ? (
                      <span className="badge approved">✅ Vinculada</span>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={binding}
                        onClick={() => handleBind(dev.id, dev.name)}
                      >
                        {binding ? <span className="loading-spinner" /> : '🔗 Vincular'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeEsp.mpPosId && !loadingMp && (
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px', textAlign: 'right' }}>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={binding}
                  onClick={() => handleBind(null, null)}
                >
                  ❌ Desvincular Maquininha Atual
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
