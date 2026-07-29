import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

async function ensureSeed() {
  try {
    const totalClients = await prisma.client.count()
    if (totalClients === 0) {
      const hashedPassword = await bcrypt.hash('Brasil211709..', 12)
      await prisma.client.create({
        data: {
          name: 'Admin AdapterHub',
          email: 'brennandinc@gmail.com',
          passwordHash: hashedPassword,
          role: 'ADMIN',
          active: true,
          webhookToken: 'admin-webhook-' + Date.now(),
        },
      })
      const devices = [
        'ADP-001', 'ADP-002', 'ADP-003', 'ADP-004', 'ADP-005',
        'ADP-006', 'ADP-007', 'ADP-008', 'ADP-009', 'ADP-010',
      ]
      for (const idmaq of devices) {
        await prisma.device.upsert({ where: { idmaq }, update: {}, create: { idmaq } })
      }
      console.log('✅ Auto-seed do Admin concluído com sucesso!')
    }
  } catch (err) {
    console.error('[auth ensureSeed error]', err)
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const cleanEmail = credentials.email.trim().toLowerCase()

        // Guarantee database has admin account even if seed script hasn't run yet
        await ensureSeed()

        const user = await prisma.client.findFirst({
          where: {
            email: {
              equals: cleanEmail,
              mode: 'insensitive',
            },
          },
        })

        if (!user || user.active === false) return null

        const passwordMatch = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!passwordMatch) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          webhookToken: user.webhookToken,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.webhookToken = (user as any).webhookToken
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.webhookToken = token.webhookToken as string
      }
      return session
    },
  },
}
