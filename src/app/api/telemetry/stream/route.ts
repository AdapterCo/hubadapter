import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  let isClosed = false;
  let lastTelemetryAt: Date = new Date();
  let lastPaymentAt: Date = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream may have been closed
        }
      };

      const sendHeartbeat = () => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Stream may have been closed
        }
      };

      const poll = async () => {
        if (isClosed) return;
        try {
          // Fetch new telemetry events since last poll
          const events = await prisma.telemetryEvent.findMany({
            where: {
              createdAt: { gt: lastTelemetryAt },
              ...(isAdmin ? {} : { esp32: { machine: { clientId } } }),
            },
            orderBy: { createdAt: "asc" },
            take: 50,
            include: {
              esp32: {
                select: { id: true, serialNumber: true, mqttTopic: true },
              },
            },
          });

          for (const event of events) {
            lastTelemetryAt = event.createdAt;
            sendEvent({ type: "telemetry", event });
          }

          // Also fetch recent approved payments
          const payments = await prisma.payment.findMany({
            where: {
              ...(isAdmin ? {} : { clientId }),
              createdAt: { gt: lastPaymentAt },
            },
            orderBy: { createdAt: "asc" },
            take: 10,
            include: {
              esp32: {
                select: { id: true, serialNumber: true },
              },
            },
          });

          for (const payment of payments) {
            if (payment.createdAt > lastPaymentAt) {
              lastPaymentAt = payment.createdAt;
            }
            sendEvent({
              type: "payment",
              payment: { ...payment, amount: Number(payment.amount) },
            });
          }
        } catch (err) {
          console.error("[telemetry/stream poll error]", err);
        }
      };

      // Initial heartbeat
      sendHeartbeat();

      // Setup polling interval every 3 seconds
      const pollInterval = setInterval(() => {
        poll();
      }, 3000);

      // Setup heartbeat interval every 15 seconds
      const heartbeatInterval = setInterval(() => {
        sendHeartbeat();
      }, 15000);

      req.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
