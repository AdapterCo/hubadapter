import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// GET /api/client/settings - returns current client mpAccessToken (masked) and webhookToken
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await prisma.client.findUnique({
      where: { id: session.user.id },
      select: { mpAccessToken: true, mpWebhookSecret: true, webhookToken: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      mpAccessToken: client.mpAccessToken ? "Configurado" : "",
      mpWebhookSecret: client.mpWebhookSecret ? "Configurado" : "",
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
    if (Number(req.headers.get("content-length") || 0) > 16 * 1024) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mpAccessToken, mpWebhookSecret } = body;

    if (mpAccessToken === undefined && mpWebhookSecret === undefined) {
      return NextResponse.json(
        { error: "mpAccessToken or mpWebhookSecret is required" },
        { status: 400 }
      );
    }

    if (
      (mpAccessToken !== undefined && typeof mpAccessToken !== "string") ||
      (mpWebhookSecret !== undefined && typeof mpWebhookSecret !== "string")
    ) {
      return NextResponse.json(
        { error: "Secrets must be strings" },
        { status: 400 }
      );
    }

    const existing = await prisma.client.findUnique({
      where: { id: session.user.id },
      select: { mpAccessToken: true, mpWebhookSecret: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const data: {
      mpAccessToken?: string | null;
      mpWebhookSecret?: string | null;
      mpTokenValid?: boolean | null;
      mpTokenCheckedAt?: Date | null;
    } = {};
    if (mpAccessToken !== undefined && mpAccessToken !== "Configurado") {
      const cleanToken = mpAccessToken.trim();
      data.mpAccessToken = cleanToken ? encryptSecret(cleanToken) : null;
      data.mpTokenValid = null;
      data.mpTokenCheckedAt = null;
    }
    if (mpWebhookSecret !== undefined && mpWebhookSecret !== "Configurado") {
      const cleanSecret = mpWebhookSecret.trim();
      data.mpWebhookSecret = cleanSecret ? encryptSecret(cleanSecret) : null;
    }

    await prisma.client.update({
      where: { id: session.user.id },
      data,
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
