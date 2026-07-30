'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

interface Payment {
  id: string
  mpPaymentId: string
  amount: number
  status: string
  paymentMethod: string | null
  createdAt: string
  esp32: { id: string; serialNumber: string }
}

function fmt(val: number) { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function getNormalizedMethod(p: Payment): 'Pix' | 'Crédito' | 'Débito' {
  const m = String(p.paymentMethod || '').toLowerCase()
  if (m.includes('pix') || m.includes('bank_transfer')) return 'Pix'
  if (m.includes('prepaid') || m.includes('débito') || m.includes('debito')) return 'Débito'
  if (m.includes('credit') || m.includes('crédito') || m.includes('credito')) return 'Crédito'
  return 'Pix'
}

export default function PagamentosPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  // Filtering states
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected' | 'pix' | 'credit' | 'debit'>('all')
  const [deviceFilter, setDeviceFilter] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom'>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const load = useCallback(async () => {
    const res = await fetch('/api/payments?limit=200')
    const data = await res.json()
    setPayments(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Get list of unique devices for dropdown filter
  const devicesList = useMemo(() => {
    const map = new Map<string, string>()
    payments.forEach(p => {
      if (p.esp32?.serialNumber) {
        map.set(p.esp32.serialNumber, p.esp32.serialNumber)
      }
    })
    return Array.from(map.values()).sort()
  }, [payments])

  // Filtered Payments
  const filtered = useMemo(() => {
    return payments.filter(p => {
      // 1. Status / Method filter
      if (statusFilter === 'approved' && p.status !== 'approved') return false
      if (statusFilter === 'rejected' && p.status !== 'rejected' && p.status !== 'refunded') return false
      
      const method = getNormalizedMethod(p)
      if (statusFilter === 'pix' && method !== 'Pix') return false
      if (statusFilter === 'credit' && method !== 'Crédito') return false
      if (statusFilter === 'debit' && method !== 'Débito') return false

      // 2. Device filter
      if (deviceFilter !== 'all' && p.esp32?.serialNumber !== deviceFilter) return false

      // 3. Date filter
      const pDate = new Date(p.createdAt)
      const now = new Date()

      if (datePreset === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        if (pDate < start) return false
      } else if (datePreset === 'yesterday') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        if (pDate < start || pDate >= end) return false
      } else if (datePreset === '7days') {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        if (pDate < start) return false
      } else if (datePreset === '30days') {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        if (pDate < start) return false
      } else if (datePreset === 'custom') {
        if (startDate) {
          const s = new Date(startDate)
          if (pDate < s) return false
        }
        if (endDate) {
          const e = new Date(endDate)
          e.setHours(23, 59, 59, 999)
          if (pDate > e) return false
        }
      }

      return true
    })
  }, [payments, statusFilter, deviceFilter, datePreset, startDate, endDate])

  // Counters & Financial Audit Metrics for current view
  const approvedFiltered = useMemo(() => filtered.filter(p => p.status === 'approved'), [filtered])
  const refundedFiltered = useMemo(() => filtered.filter(p => p.status === 'refunded' || p.status === 'rejected'), [filtered])

  const totalApprovedAmount = useMemo(() => approvedFiltered.reduce((a, p) => a + p.amount, 0), [approvedFiltered])
  const totalRefundedAmount = useMemo(() => refundedFiltered.reduce((a, p) => a + p.amount, 0), [refundedFiltered])
  const totalIntegerCredits = useMemo(() => approvedFiltered.reduce((a, p) => a + Math.floor(p.amount), 0), [approvedFiltered])

  // Global method breakdown (approved only)
  const pixPayments = useMemo(() => payments.filter(p => getNormalizedMethod(p) === 'Pix' && p.status === 'approved'), [payments])
  const creditPayments = useMemo(() => payments.filter(p => getNormalizedMethod(p) === 'Crédito' && p.status === 'approved'), [payments])
  const debitPayments = useMemo(() => payments.filter(p => getNormalizedMethod(p) === 'Débito' && p.status === 'approved'), [payments])

  const totalPix = useMemo(() => pixPayments.reduce((a, p) => a + p.amount, 0), [pixPayments])
  const totalCredit = useMemo(() => creditPayments.reduce((a, p) => a + p.amount, 0), [creditPayments])
  const totalDebit = useMemo(() => debitPayments.reduce((a, p) => a + p.amount, 0), [debitPayments])

  // CSV Audit Report Exporter
  function exportCSV() {
    if (filtered.length === 0) return
    const headers = ['Data e Hora', 'Valor (R$)', 'Metodo', 'Status', 'IDMAQ Dispositivo', 'ID Mercado Pago']
    const rows = filtered.map(p => [
      `"${new Date(p.createdAt).toLocaleString('pt-BR')}"`,
      p.amount.toFixed(2),
      `"${getNormalizedMethod(p)}"`,
      `"${p.status === 'approved' ? 'Aprovado' : p.status === 'refunded' ? 'Estornado' : 'Rejeitado'}"`,
      `"${p.esp32?.serialNumber || 'N/A'}"`,
      `"${p.mpPaymentId}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `relatorio_auditoria_pagamentos_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Pagamentos & Auditoria Financeira</h1>
          <p>{fmt(totalApprovedAmount)} em vendas aprovadas na visualização atual</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={exportCSV} disabled={filtered.length === 0}>
            📥 Exportar Relatório (CSV)
          </button>
          <button className="btn btn-secondary" onClick={load}>🔄 Atualizar</button>
        </div>
      </div>

      {/* Relatório Resumido de Métodos de Pagamento */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon green">⚡</div>
          <div>
            <div className="stat-value">{pixPayments.length} vendas</div>
            <div className="stat-label">Pix ({fmt(totalPix)})</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">💳</div>
          <div>
            <div className="stat-value">{creditPayments.length} vendas</div>
            <div className="stat-label">Cartão de Crédito ({fmt(totalCredit)})</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">💳</div>
          <div>
            <div className="stat-value">{debitPayments.length} vendas</div>
            <div className="stat-label">Cartão de Débito ({fmt(totalDebit)})</div>
          </div>
        </div>
      </div>

      {/* PAINEL DE FILTROS AVANÇADOS DE AUDITORIA */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>
            🔍 Filtros de Auditoria
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Exibindo <strong>{filtered.length}</strong> de {payments.length} transações
          </div>
        </div>

        <div className="grid-3" style={{ gap: '16px', marginBottom: '16px' }}>
          {/* Filtro por Dispositivo */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">📡 Dispositivo (IDMAQ)</label>
            <select
              className="form-input"
              value={deviceFilter}
              onChange={e => setDeviceFilter(e.target.value)}
            >
              <option value="all">Todos os Dispositivos</option>
              {devicesList.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Período Preset */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">📅 Período</label>
            <select
              className="form-input"
              value={datePreset}
              onChange={e => setDatePreset(e.target.value as any)}
            >
              <option value="all">Todo o Histórico</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="7days">Últimos 7 dias</option>
              <option value="30days">Últimos 30 dias</option>
              <option value="custom">Personalizado (Seletor de Datas)</option>
            </select>
          </div>

          {/* Datas Customizadas */}
          {datePreset === 'custom' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">De:</label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Até:</label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Abas Rápidas por Status / Método */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <button
            className={`btn ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('all')}
          >
            Todos os Status ({payments.length})
          </button>
          <button
            className={`btn ${statusFilter === 'approved' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('approved')}
          >
            ✅ Aprovados ({payments.filter(p => p.status === 'approved').length})
          </button>
          <button
            className={`btn ${statusFilter === 'rejected' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('rejected')}
          >
            ❌ Rejeitados / Estornados ({payments.filter(p => p.status === 'rejected' || p.status === 'refunded').length})
          </button>
          <button
            className={`btn ${statusFilter === 'pix' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('pix')}
          >
            ⚡ Pix ({payments.filter(p => getNormalizedMethod(p) === 'Pix').length})
          </button>
          <button
            className={`btn ${statusFilter === 'credit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('credit')}
          >
            💳 Crédito ({payments.filter(p => getNormalizedMethod(p) === 'Crédito').length})
          </button>
          <button
            className={`btn ${statusFilter === 'debit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('debit')}
          >
            💳 Débito ({payments.filter(p => getNormalizedMethod(p) === 'Débito').length})
          </button>
        </div>
      </div>

      {/* TOTALIZADOR DA AUDITORIA SELECIONADA */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Faturamento Auditado Aprovado: </span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--success)' }}>{fmt(totalApprovedAmount)}</span>
        </div>

        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Créditos Físicos Entregues: </span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-light)' }}>{totalIntegerCredits} crédito(s)</span>
        </div>

        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Estornado / Rejeitado: </span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--danger)' }}>{fmt(totalRefundedAmount)}</span>
        </div>
      </div>

      {/* TABELA DE PAGAMENTOS AUDITADOS */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum pagamento encontrado para a combinação de filtros selecionada.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data e Hora</th>
                  <th>Valor Pago</th>
                  <th>Método</th>
                  <th>Status</th>
                  <th>Dispositivo</th>
                  <th>MP ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const method = getNormalizedMethod(p)
                  return (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {new Date(p.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="strong">{fmt(p.amount)}</td>
                      <td>
                        <span className={`badge ${method === 'Pix' ? 'online' : method === 'Crédito' ? 'info' : 'warning'}`} style={{ fontSize: '11px' }}>
                          {method === 'Pix' ? '⚡ Pix' : method === 'Crédito' ? '💳 Crédito' : '💳 Débito'}
                        </span>
                      </td>
                      <td>
                        {p.status === 'approved' ? (
                          <span className="badge online">✅ Aprovado</span>
                        ) : p.status === 'refunded' ? (
                          <span className="badge warning">💸 Estornado</span>
                        ) : (
                          <span className="badge offline">❌ Rejeitado</span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.esp32?.serialNumber || 'N/A'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>#{p.mpPaymentId}</td>
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
