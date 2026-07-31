import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

function generateRandomIdmaq(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 caracteres legíveis sem ambiguidade
  let code = 'ADP';
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code; // Total 10 caracteres (ex: ADP8K3X9L2)
}

// GET /api/admin/devices - Listar todos os dispositivos (IDMAQ)
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Acesso negado. Requer conta de Administrador." }, { status: 403 });
  }

  try {
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        idmaq: true,
        claimed: true,
        clientId: true,
        createdAt: true,
        client: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { idmaq: "asc" },
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error("[admin/devices GET]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

// POST /api/admin/devices - Adicionar único, lote ou GERAR AUTOMATICAMENTE (1, 10 ou 30)
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await req.json();

    // 1. GERADOR AUTOMÁTICO EM LOTE: { generateCount: 1 | 10 | 30 }
    if (typeof body.generateCount === "number" && body.generateCount > 0) {
      const count = Math.min(Math.max(body.generateCount, 1), 100);
      const generatedList: string[] = [];

      let attempts = 0;
      while (generatedList.length < count && attempts < count * 5) {
        attempts++;
        const candidate = generateRandomIdmaq();
        // Verificar se já existe no banco
        const existing = await prisma.device.findUnique({ where: { idmaq: candidate } });
        if (!existing && !generatedList.includes(candidate)) {
          generatedList.push(candidate);
        }
      }

      let createdCount = 0;
      for (const idmaq of generatedList) {
        try {
          await prisma.device.create({
            data: {
              idmaq,
              claimed: false,
            },
          });
          createdCount++;
        } catch {
          // Ignorar se houver colisão pontual
        }
      }

      return NextResponse.json(
        {
          success: true,
          created: createdCount,
          idmaqs: generatedList,
        },
        { status: 201 }
      );
    }

    // 2. ADICIONAR LOTE MANUAL: { idmaqs: string[] }
    if (Array.isArray(body.idmaqs)) {
      const idmaqs: string[] = body.idmaqs.filter(
        (v: unknown) => typeof v === "string" && v.trim() !== ""
      );

      if (idmaqs.length === 0) {
        return NextResponse.json(
          { error: "A lista de IDMAQs está vazia ou é inválida." },
          { status: 400 }
        );
      }

      let createdCount = 0;
      for (const idmaq of idmaqs) {
        try {
          const cleanIdmaq = idmaq.trim().toUpperCase();
          await prisma.device.create({
            data: {
              idmaq: cleanIdmaq,
              claimed: false,
            },
          });
          createdCount++;
        } catch {
          // Ignorar duplicados silenciosamente
        }
      }

      return NextResponse.json(
        {
          created: createdCount,
          skippedDuplicates: idmaqs.length - createdCount,
        },
        { status: 201 }
      );
    }

    // 3. ADICIONAR ÚNICO MANUAL: { idmaq: string }
    const { idmaq } = body;
    if (!idmaq || typeof idmaq !== "string" || idmaq.trim() === "") {
      return NextResponse.json(
        { error: "O código IDMAQ é obrigatório ou selecione uma das opções de geração automática." },
        { status: 400 }
      );
    }

    const cleanIdmaq = idmaq.trim().toUpperCase();
    const device = await prisma.device.create({
      data: {
        idmaq: cleanIdmaq,
        claimed: false,
      },
    });

    return NextResponse.json(
      {
        ...device,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Um dispositivo com este IDMAQ já existe cadastrado." },
        { status: 409 }
      );
    }
    console.error("[admin/devices POST]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
