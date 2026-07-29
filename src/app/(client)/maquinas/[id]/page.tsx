'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

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
  }, [loadMachine])

  // Open binding modal and fetch MP devices securely from backend
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
    } catch (err) {
      setMpError('Erro de conexão ao buscar máquinas.')
    } finally {
      setLoadingMp(false)
    }
  }

  // Bind selected MP card machine to ESP32 via backend
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
    } catch (err) {
      alert('Erro de conexão ao vincular.')
    } finally {
      setBinding(false)
    }
  }

  async function sendMqttCommand(topic: string, action: string) {
    await fetch('/api/mqtt/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        message: JSON.stringify({ action, timestamp: Date.now() }),
      }),
    })
    alert(`Comando ${action.toUpperCase()} enviado para o ESP32!`)
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
        <a href="/maquinas" className="btn btn-secondary">⬅️ Voltar</a>
      </div>

      <div className="section-title">📡 Dispositivo ESP32 (IDMAQ) Vinculado</div>

      {machine.esps.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <p>Nenhum ESP32 vinculado a esta máquina.</p>
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
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Tópico MQTT: <code style={{ color: 'var(--accent-light)', fontFamily: 'monospace' }}>{esp.mqttTopic}</code>
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
                    {esp.mpPosName ? (
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                        ✅ {esp.mpPosName} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>(ID: {esp.mpPosId})</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--warning)', marginTop: '4px' }}>
                        ⚠️ Nenhuma máquina do Mercado Pago vinculada a este ESP32
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => openBindModal(esp)}
                    id={`btn-bind-mp-${esp.id}`}
                  >
                    🔄 {esp.mpPosName ? 'Alterar Maquininha MP' : 'Buscar & Vincular Maquininha MP'}
                  </button>
                </div>
              </div>

              {/* Actions & Credits */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Crédito Total Acumulado: </span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-light)' }}>
                    R$ {esp.credits.toFixed(2)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => sendMqttCommand(esp.mqttTopic, 'ping')}
                  >
                    📡 Testar Conexão (Ping)
                  </button>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => sendMqttCommand(esp.mqttTopic, 'credit_test')}
                  >
                    ⚡ Teste de Crédito (+ R$ 1,00)
                  </button>
                </div>
              </div>
            </div>
          ))}
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
              Vinculando ao ESP32 <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{activeEsp.serialNumber}</strong>. As consultas ao Mercado Pago são processadas com segurança no backend.
            </p>

            {loadingMp ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <span className="loading-spinner" /><br />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                  Consultando maquininhas cadastradas no seu Mercado Pago...
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
                      justify: 'space-between',
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
                        ID POS: {dev.id} {dev.operating_mode ? `• Modo: ${dev.operating_mode}` : ''}
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
