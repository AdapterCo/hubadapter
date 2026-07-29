import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      webhookToken: string
    }
  }
  interface User {
    role: string
    webhookToken: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    webhookToken: string
  }
}
