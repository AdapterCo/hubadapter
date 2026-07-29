import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/payments - returns payments for current client with pagination
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const esp32Id = searchParams.get("esp32Id") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
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

    return NextResponse.json(payments);
  } catch (error) {
    console.error("[payments GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
