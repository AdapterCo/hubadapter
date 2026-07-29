import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { checkRateLimit } from './rate-limit'

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
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null

        const cleanEmail = credentials.email.trim().toLowerCase()
        const forwardedFor = request.headers?.['x-forwarded-for']
        const ip = Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : String(forwardedFor || 'unknown').split(',')[0].trim()
        const rateLimit = checkRateLimit(`login:${ip}:${cleanEmail}`, 10, 15 * 60 * 1000)
        if (!rateLimit.allowed) return null

        const user = await prisma.client.findUnique({ where: { email: cleanEmail } })

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
        token.role = user.role
        token.webhookToken = user.webhookToken
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
