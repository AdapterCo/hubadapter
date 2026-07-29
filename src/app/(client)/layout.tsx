import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role === 'ADMIN') redirect('/admin/dashboard')

  return (
    <div className="layout-wrapper">
      <Sidebar role={session.user.role} userName={session.user.name} />
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
