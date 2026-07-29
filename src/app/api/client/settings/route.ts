import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/client/settings - returns current client mpAccessToken (masked) and webhookToken
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await prisma.client.findUnique({
      where: { id: session.user.id },
      select: { mpAccessToken: true, webhookToken: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Mask mpAccessToken: show first 8 and last 4 characters only
    const maskToken = (token: string | null): string => {
      if (!token) return "";
      if (token.length <= 12) return "****";
      return `${token.slice(0, 8)}${"*".repeat(token.length - 12)}${token.slice(-4)}`;
    };

    return NextResponse.json({
      mpAccessToken: maskToken(client.mpAccessToken),
      webhookToken: client.webhookToken,
    });
  } catch (error) {
    console.error("[client/settings GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/client/settings - update mpAccessToken
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mpAccessToken } = body;

    if (mpAccessToken === undefined) {
      return NextResponse.json(
        { error: "mpAccessToken is required" },
        { status: 400 }
      );
    }

    if (typeof mpAccessToken !== "string") {
      return NextResponse.json(
        { error: "mpAccessToken must be a string" },
        { status: 400 }
      );
    }

    await prisma.client.update({
      where: { id: session.user.id },
      data: { mpAccessToken },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[client/settings PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
