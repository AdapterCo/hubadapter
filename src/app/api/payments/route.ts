import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/payments - Listar pagamentos do cliente
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const esp32Id = searchParams.get("esp32Id") ?? undefined;
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
    const page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
    const skip = (page - 1) * limit;

    const where = {
      clientId: session.user.id,
      ...(esp32Id ? { esp32Id } : {}),
    };

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        esp32: {
          select: { id: true, serialNumber: true, mqttTopic: true },
        },
      },
    });

    return NextResponse.json(
      payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      }))
    );
  } catch (error) {
    console.error("[payments GET]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
