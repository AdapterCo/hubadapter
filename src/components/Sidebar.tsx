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
  userEmail: string
}

const adminNav: NavItem[] = [
  { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/admin/clientes', icon: '👥', label: 'Clientes' },
  { href: '/admin/dispositivos', icon: '📦', label: 'Dispositivos (IDMAQ)' },
  { href: '/admin/pagamentos', icon: '💳', label: 'Pagamentos' },
  { href: '/admin/telemetria', icon: '📡', label: 'Telemetria Global' },
]

const clientNav: NavItem[] = [
  { href: '/painel', icon: '📊', label: 'Dashboard' },
  { href: '/maquinas', icon: '🖥️', label: 'Minhas Máquinas' },
  { href: '/pagamentos', icon: '💳', label: 'Pagamentos' },
  { href: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

export default function Sidebar({ role, userName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'ADMIN' ? adminNav : clientNav

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">📡</div>
        <div>
          <div className="logo-text">AdapterHub</div>
          <div className="logo-sub">Sistema de Telemetria</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-title">
          {role === 'ADMIN' ? 'Administração' : 'Menu Principal'}
        </span>

        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}`}
          >
            <span style={{ fontSize: '16px' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
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
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '16px',
              padding: '4px',
              flexShrink: 0,
            }}
          >
            🚪
          </button>
        </div>
      </div>
    </aside>
  )
}
