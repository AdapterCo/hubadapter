'use client'

import { useState, useEffect, useCallback } from 'react'

interface SubscriptionDevice {
  id: string
  serialNumber: string
  status: 'ACTIVE' | 'OVERDUE' | 'BLOCKED'
  rawStatus: string
  paidUntil: string | null
  monthlyFee: number
  client: { id: string; name: string; email: string }
  machineName: string
  online: boolean
  lastSeen: string | null
  history: Array<{ id: string; amount: number; months: number; paidAt: string; periodEnd: string }>
}

interface Summary {
  totalDevices: number
  activeDevices: number
  overdueDevices: number
  blockedDevices: number
  totalMonthlySaasRevenue: number
}

function fmt(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AdminPagamentosPage() {
  const [data, setData] = useState<{ devices: SubscriptionDevice[]; summary: Summary } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'ACTIVE' | 'OVERDUE' | 'BLOCKED'>('all')

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/subscriptions')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Erro ao carregar mensalidades:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSubscriptionAction(esp32Id: string, action: 'renew' | 'block' | 'unblock', months = 1) {
    setActionLoadingId(esp32Id)
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esp32Id, action, months }),
      })
      const result = await res.json()
      if (res.ok) {
        alert(result.message || 'Operação realizada com sucesso!')
        loadData()
      } else {
        alert(result.error || 'Erro ao processar ação.')
      }
    } catch {
      alert('Erro de comunicação com o servidor.')
    } finally {
      setActionLoadingId(null)
    }
  }

  if (loading) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '80px' }}><span className="loading-spinner" /></div>
      </div>
    )
  }

  const devices = data?.devices || []
  const summary = data?.summary || {
    totalDevices: 0,
    activeDevices: 0,
    overdueDevices: 0,
    blockedDevices: 0,
    totalMonthlySaasRevenue: 0,
  }

  const filteredDevices = devices.filter(d => (filter === 'all' ? true : d.status === filter))

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Gestão de Mensalidades da Plataforma</h1>
          <p>Controle de assinaturas (R$ 29,99/mês por IDMAQ) e bloqueio por inadimplência</p>
        </div>
        <button className="btn btn-secondary" onClick={loadData}>🔄 Atualizar</button>
      </div>

      {/* Cartões de Receita SaaS da Plataforma */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div>
            <div className="stat-value">{fmt(summary.totalMonthlySaasRevenue)}</div>
            <div className="stat-label">Receita Mensal Estimada</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">🟢</div>
          <div>
            <div className="stat-value">{summary.activeDevices} / {summary.totalDevices}</div>
            <div className="stat-label">Dispositivos Adimplentes</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon yellow">🟡</div>
          <div>
            <div className="stat-value">{summary.overdueDevices}</div>
            <div className="stat-label">Mensalidades Pendentes</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">🔴</div>
          <div>
            <div className="stat-value">{summary.blockedDevices}</div>
            <div className="stat-label">Dispositivos Bloqueados</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('all')}
        >
          Todos os Dispositivos ({devices.length})
        </button>
        <button
          className={`btn ${filter === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('ACTIVE')}
        >
          🟢 Ativos ({summary.activeDevices})
        </button>
        <button
          className={`btn ${filter === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('OVERDUE')}
        >
          🟡 Vencidos ({summary.overdueDevices})
        </button>
        <button
          className={`btn ${filter === 'BLOCKED' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('BLOCKED')}
        >
          🔴 Bloqueados ({summary.blockedDevices})
        </button>
      </div>

      {/* Tabela de Dispositivos e Mensalidades */}
      <div className="card">
        {filteredDevices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum dispositivo encontrado para o filtro selecionado.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Máquina</th>
                  <th>IDMAQ Dispositivo</th>
                  <th>Mensalidade</th>
                  <th>Status Assinatura</th>
                  <th>Válido Até</th>
                  <th>Ações de Controle</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map(d => {
                  const isProcessing = actionLoadingId === d.id
                  return (
                    <tr key={d.id}>
                      <td className="strong">
                        {d.client?.name}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.client?.email}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>🖥️ {d.machineName}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{d.serialNumber}</td>
                      <td className="strong" style={{ color: 'var(--accent-light)' }}>
                        {fmt(d.monthlyFee)}/mês
                      </td>
                      <td>
                        {d.status === 'ACTIVE' ? (
                          <span className="badge online">🟢 Ativo</span>
                        ) : d.status === 'OVERDUE' ? (
                          <span className="badge warning">🟡 Vencido</span>
                        ) : (
                          <span className="badge offline">🔴 Bloqueado</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {d.paidUntil ? (
                          new Date(d.paidUntil).toLocaleDateString('pt-BR')
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Sem registro</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={isProcessing}
                            onClick={() => handleSubscriptionAction(d.id, 'renew', 1)}
                            title="Dar baixa e renovar por +30 dias"
                          >
                            {isProcessing ? <span className="loading-spinner" /> : '💳 Dar Baixa (+30d)'}
                          </button>

                          {d.status === 'BLOCKED' ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={isProcessing}
                              onClick={() => handleSubscriptionAction(d.id, 'unblock')}
                            >
                              🟢 Desbloquear
                            </button>
                          ) : (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={isProcessing}
                              onClick={() => handleSubscriptionAction(d.id, 'block')}
                            >
                              🔴 Bloquear
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
