'use client'

import { useState, useEffect, useCallback } from 'react'

interface Payment {
  id: string
  mpPaymentId: string
  amount: number
  status: string
  paymentMethod: string | null
  createdAt: string
  esp32: { serialNumber: string }
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
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected' | 'pix' | 'credit' | 'debit'>('all')

  const load = useCallback(async () => {
    const res = await fetch('/api/payments?limit=100')
    const data = await res.json()
    setPayments(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = payments.filter(p => {
    if (filter === 'all') return true
    if (filter === 'approved') return p.status === 'approved'
    if (filter === 'rejected') return p.status === 'rejected' || p.status === 'refunded'
    const method = getNormalizedMethod(p)
    if (filter === 'pix') return method === 'Pix'
    if (filter === 'credit') return method === 'Crédito'
    if (filter === 'debit') return method === 'Débito'
    return true
  })

  // Counters
  const countAll = payments.length
  const countApproved = payments.filter(p => p.status === 'approved').length
  const countRejected = payments.filter(p => p.status === 'rejected' || p.status === 'refunded').length

  const pixPayments = payments.filter(p => getNormalizedMethod(p) === 'Pix' && p.status === 'approved')
  const creditPayments = payments.filter(p => getNormalizedMethod(p) === 'Crédito' && p.status === 'approved')
  const debitPayments = payments.filter(p => getNormalizedMethod(p) === 'Débito' && p.status === 'approved')

  const countPix = payments.filter(p => getNormalizedMethod(p) === 'Pix').length
  const countCredit = payments.filter(p => getNormalizedMethod(p) === 'Crédito').length
  const countDebit = payments.filter(p => getNormalizedMethod(p) === 'Débito').length

  const totalApproved = payments.filter(p => p.status === 'approved').reduce((a, p) => a + p.amount, 0)
  const totalPix = pixPayments.reduce((a, p) => a + p.amount, 0)
  const totalCredit = creditPayments.reduce((a, p) => a + p.amount, 0)
  const totalDebit = debitPayments.reduce((a, p) => a + p.amount, 0)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Pagamentos</h1>
          <p>{fmt(totalApproved)} em pagamentos aprovados</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>🔄 Atualizar</button>
      </div>

      {/* Relatório Resumido de Métodos de Pagamento */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon green">⚡</div>
          <div>
            <div className="stat-value">{pixPayments.length} pagamentos</div>
            <div className="stat-label">Pix ({fmt(totalPix)})</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">💳</div>
          <div>
            <div className="stat-value">{creditPayments.length} pagamentos</div>
            <div className="stat-label">Cartão de Crédito ({fmt(totalCredit)})</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">💳</div>
          <div>
            <div className="stat-value">{debitPayments.length} pagamentos</div>
            <div className="stat-label">Cartão de Débito ({fmt(totalDebit)})</div>
          </div>
        </div>
      </div>

      {/* Abas e Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('all')}
        >
          Todos ({countAll})
        </button>
        <button
          className={`btn ${filter === 'approved' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('approved')}
        >
          ✅ Aprovados ({countApproved})
        </button>
        <button
          className={`btn ${filter === 'rejected' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('rejected')}
        >
          ❌ Rejeitados / Estornados ({countRejected})
        </button>
        <button
          className={`btn ${filter === 'pix' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('pix')}
        >
          ⚡ Pix ({countPix})
        </button>
        <button
          className={`btn ${filter === 'credit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('credit')}
        >
          💳 Crédito ({countCredit})
        </button>
        <button
          className={`btn ${filter === 'debit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('debit')}
        >
          💳 Débito ({countDebit})
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum pagamento encontrado para o filtro selecionado.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Valor</th>
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
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.esp32.serialNumber}</td>
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
