'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

interface NavItem {
  href: string
  icon: string
  label: string
}

interface SidebarProps {
  role: string
  userName: string
}

const adminNav: NavItem[] = [
  { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/admin/clientes', icon: '👥', label: 'Clientes' },
  { href: '/admin/dispositivos', icon: '📦', label: 'Dispositivos' },
  { href: '/admin/pagamentos', icon: '💳', label: 'Mensalidades' },
  { href: '/admin/telemetria', icon: '📡', label: 'Telemetria' },
]

const clientNav: NavItem[] = [
  { href: '/painel', icon: '📊', label: 'Dashboard' },
  { href: '/maquinas', icon: '🖥️', label: 'Minhas Máquinas' },
  { href: '/pagamentos', icon: '💳', label: 'Pagamentos' },
  { href: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

export default function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navItems = role === 'ADMIN' ? adminNav : clientNav

  // Travar o scroll do body quando a gaveta mobile estiver aberta
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Fechar gaveta mobile ao navegar
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      {/* HEADER FIXO MOBILE (Apenas < 768px) */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <div className="logo-icon">📡</div>
          <div>
            <div className="logo-text">AdapterHub</div>
            <div className="logo-sub">{role === 'ADMIN' ? 'Painel Admin' : 'Sistema de Telemetria'}</div>
          </div>
        </div>

        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label="Toggle Menu"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* OVERLAY ESCURO BACKDROP */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* GAVETA LATERAL SLIDE-IN (DESKTOP E MOBILE) */}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon">📡</div>
          <div>
            <div className="logo-text">AdapterHub</div>
            <div className="logo-sub">{role === 'ADMIN' ? 'Painel Admin' : 'Sistema de Telemetria'}</div>
          </div>
          <button
            className="mobile-close-btn"
            onClick={() => setMobileOpen(false)}
          >
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-title">
            {role === 'ADMIN' ? 'Administração' : 'Menu Principal'}
          </span>

          {navItems.map(item => {
            const isActive = pathname === item.href || (item.href !== '/painel' && item.href !== '/admin/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="user-avatar">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName}
              </div>
              <div className="user-role">{role === 'ADMIN' ? 'Administrador' : 'Cliente'}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sair da Conta"
              className="logout-btn"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* BARRA FIXA INFERIOR (BOTTOM NAV BAR PARACELLULAR) */}
      <nav className="mobile-bottom-nav">
        {navItems.slice(0, 4).map(item => {
          const isActive = pathname === item.href || (item.href !== '/painel' && item.href !== '/admin/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              <span className="label">{item.label.split(' ')[0]}</span>
            </Link>
          )
        })}
        <button
          className="mobile-bottom-nav-item"
          onClick={() => setMobileOpen(prev => !prev)}
        >
          <span className="icon">☰</span>
          <span className="label">Menu</span>
        </button>
      </nav>
    </>
  )
}
