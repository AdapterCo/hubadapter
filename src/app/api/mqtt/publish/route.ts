import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const publishSchema = z.object({
  esp32Id: z.string().min(1).max(128),
  action: z.enum(["ping", "credit_test"]),
}).strict();

export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 8 * 1024) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = publishSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid esp32Id or action" },
        { status: 400 }
      );
    }
    const { esp32Id, action } = parsed.data;

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id: String(esp32Id),
        ...(session.user.role === "ADMIN"
          ? {}
          : { machine: { clientId: session.user.id } }),
      },
    });
    if (!esp32) {
      return NextResponse.json({ error: "ESP32 not found" }, { status: 404 });
    }

    const paymentId = `manual-${crypto.randomUUID()}`;
    const amount = action === "credit_test" ? "1.00" : "0.00";
    const message = JSON.stringify({
      action,
      amount: Number(amount),
      paymentId,
    });

    const mqttRes = await fetch(process.env.MQTT_API_URL || "https://apimqtt.adapterco.com.br/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: esp32.mqttTopic, message }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await mqttRes.json().catch(() => ({}));

    return NextResponse.json(data, { status: mqttRes.status });
  } catch (error) {
    console.error("[mqtt/publish]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
