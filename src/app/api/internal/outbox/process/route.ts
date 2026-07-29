import { NextRequest, NextResponse } from 'next/server'
import { processOutboxBatch } from '@/lib/outbox'
import { secretsEqual } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const expected = process.env.OUTBOX_WORKER_SECRET
  const authorization = req.headers.get('authorization')
  const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

  if (!expected || !provided || !secretsEqual(expected, provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(await processOutboxBatch())
}
