'use client'

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
  { href: '/admin/dispositivos', icon: '📦', label: 'IDMAQs' },
  { href: '/admin/pagamentos', icon: '💳', label: 'Mensalidades' },
  { href: '/admin/telemetria', icon: '📡', label: 'Telemetria' },
]

const clientNav: NavItem[] = [
  { href: '/painel', icon: '📊', label: 'Dashboard' },
  { href: '/maquinas', icon: '🖥️', label: 'Máquinas' },
  { href: '/pagamentos', icon: '💳', label: 'Pagamentos' },
  { href: '/configuracoes', icon: '⚙️', label: 'Ajustes' },
]

export default function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'ADMIN' ? adminNav : clientNav

  return (
    <>
      {/* SIDEBAR PADRÃO PARA COMPUTADOR (EXIBIDA APENAS EM DESKTOP >= 768px) */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">📡</div>
          <div>
            <div className="logo-text">AdapterHub</div>
            <div className="logo-sub">{role === 'ADMIN' ? 'Painel Admin' : 'Sistema de Telemetria'}</div>
          </div>
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
              title="Sair"
              className="logout-btn"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* BARRA FIXA ÚNICA E EXCLUSIVA INFERIOR PARA CELULAR (< 768px) */}
      <nav className="mobile-bottom-nav">
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/painel' && item.href !== '/admin/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              <span className="label">{item.label}</span>
            </Link>
          )
        })}

        <button
          className="mobile-bottom-nav-item"
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Sair da Conta"
        >
          <span className="icon">🚪</span>
          <span className="label">Sair</span>
        </button>
      </nav>
    </>
  )
}
