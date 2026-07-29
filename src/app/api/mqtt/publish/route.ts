import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { topic, message } = body;

    if (!topic || message === undefined) {
      return NextResponse.json(
        { error: "Missing topic or message" },
        { status: 400 }
      );
    }

    const cleanTopic = String(topic).trim().toUpperCase();

    // Touch ESP32 online status in DB if topic matches serialNumber / IDMAQ or mqttTopic
    try {
      const esp32 = await prisma.esp32.findFirst({
        where: {
          OR: [
            { serialNumber: cleanTopic },
            { mqttTopic: String(topic) },
          ],
        },
      });

      if (esp32) {
        await prisma.esp32.update({
          where: { id: esp32.id },
          data: {
            online: true,
            lastSeen: new Date(),
          },
        });
      }
    } catch (err) {
      console.warn("[mqtt/publish] Could not touch esp32 lastSeen:", err);
    }

    // Call external MQTT broker endpoint
    const mqttRes = await fetch("https://apimqtt.adapterco.com.br/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, message }),
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
