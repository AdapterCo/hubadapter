import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
