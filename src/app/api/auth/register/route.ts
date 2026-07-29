import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  idmaq: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
}).strict()

export async function POST(req: Request) {
  try {
    const rateLimit = checkRateLimit(`register:${getRequestIp(req)}`, 5, 15 * 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente mais tarde.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
      )
    }

    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > 16 * 1024) {
      return NextResponse.json({ error: 'Payload muito grande.' }, { status: 413 })
    }

    const parsed = registerSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados de cadastro inválidos.' }, { status: 400 })
    }
    const { name: cleanName, email: cleanEmail, password, idmaq: cleanIdmaq } = parsed.data

    // Validate idmaq - must exist and not be claimed
    const device = await prisma.device.findUnique({ where: { idmaq: cleanIdmaq } })

    if (!device) {
      return NextResponse.json({ error: 'Código do dispositivo (IDMAQ) inválido. Verifique e tente novamente.' }, { status: 400 })
    }

    if (device.claimed) {
      return NextResponse.json({ error: 'Este dispositivo já foi vinculado a outra conta.' }, { status: 400 })
    }

    // Check if email already exists
    const existingUser = await prisma.client.findUnique({ where: { email: cleanEmail } })
    if (existingUser) {
      return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // Create client, claim device, and auto-create machine + ESP32 in transaction
    const client = await prisma.$transaction(async (tx) => {
      const newClient = await tx.client.create({
        data: { name: cleanName, email: cleanEmail, passwordHash, role: 'CLIENT' },
      })

      // Claim the device
      await tx.device.update({
        where: { idmaq: cleanIdmaq },
        data: { claimed: true, clientId: newClient.id },
      })

      // Auto-create a Machine for this device
      const machine = await tx.machine.create({
        data: {
          clientId: newClient.id,
          name: `Máquina ${cleanIdmaq}`,
          location: 'Principal',
        },
      })

      // Auto-create the ESP32 representing this idmaq, using cleanIdmaq as topic
      await tx.esp32.create({
        data: {
          machineId: machine.id,
          serialNumber: cleanIdmaq,
          mqttTopic: cleanIdmaq,
          online: false,
          credits: 0,
          apiKeyHash: device.apiKeyHash,
          commandSecret: device.commandSecret,
        },
      })

      return newClient
    })

    return NextResponse.json({ success: true, clientId: client.id })
  } catch (err) {
    console.error('[register POST]', err)
    return NextResponse.json({ error: 'Erro interno ao criar conta. Tente novamente.' }, { status: 500 })
  }
}
