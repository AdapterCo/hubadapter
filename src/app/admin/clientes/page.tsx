'use client'

import { useState, useEffect, useCallback } from 'react'

interface Client {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
  webhookToken: string
  _count: { machines: number; payments: number }
}

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/clients')
    const data = await res.json()
    setClients(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setShowModal(false)
      setForm({ name: '', email: '', password: '' })
      load()
    } else {
      const d = await res.json()
      setError(d.error || 'Erro ao criar cliente')
    }
    setSaving(false)
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    load()
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-content">
      <div className="page-header">
        <div><h1>Clientes</h1><p>{clients.length} clientes cadastrados</p></div>
        <button id="btn-new-client" className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ Novo Cliente
        </button>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <input
          id="search-clients"
          type="text"
          className="form-input"
          placeholder="🔍 Buscar por nome ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <span className="loading-spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <p>Nenhum cliente encontrado.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nome</th><th>Email</th><th>Máquinas</th><th>Pagamentos</th>
                  <th>Status</th><th>Cadastro</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td className="strong">{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c._count?.machines ?? 0}</td>
                    <td>{c._count?.payments ?? 0}</td>
                    <td>
                      <span className={`badge ${c.active ? 'approved' : 'rejected'}`}>
                        {c.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <a href={`/admin/clientes/${c.id}`} className="btn btn-secondary btn-sm">Ver</a>
                        <button
                          className={`btn btn-sm ${c.active ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => toggleActive(c.id, c.active)}
                        >
                          {c.active ? 'Desativar' : 'Ativar'}
                        </button>
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
              <span className="modal-title">➕ Novo Cliente</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input id="client-name" type="text" className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input id="client-email" type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Senha</label>
                <input id="client-password" type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button id="btn-save-client" type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="loading-spinner" /> : '✅'} Criar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
