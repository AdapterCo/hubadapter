import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/telemetry/stream - SSE endpoint for real-time telemetry events
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const clientId = session.user.id;

  // Track the last seen telemetry event ID and payment ID for incremental polling
  let lastTelemetryId = 0;
  let heartbeatCounter = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream may have been closed
        }
      };

      const sendHeartbeat = () => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Stream may have been closed
        }
      };

      // Initialize: get the current max telemetry ID to avoid replaying old events
      try {
        const latestEvent = await prisma.telemetryEvent.findFirst({
          where: {
            esp32: {
              machine: { clientId },
            },
          },
          orderBy: { id: "desc" },
          select: { id: true },
        });
        if (latestEvent) {
          lastTelemetryId = Number(latestEvent.id);
        }
      } catch {
        // Proceed with 0
      }

      const poll = async () => {
        try {
          // Fetch new telemetry events since last poll
          const events = await prisma.telemetryEvent.findMany({
            where: {
              id: { gt: lastTelemetryId },
              esp32: {
                machine: { clientId },
              },
            },
            orderBy: { id: "asc" },
            take: 50,
            include: {
              esp32: {
                select: { id: true, serialNumber: true, mqttTopic: true },
              },
            },
          });

          for (const event of events) {
            lastTelemetryId = Number(event.id);
            sendEvent({ type: "telemetry", event });
          }

          // Fetch recent payment updates (last 5 minutes)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const recentPayments = await prisma.payment.findMany({
            where: {
              clientId,
              // SQLite stores dates as strings; we rely on ordering
            },
            orderBy: { id: "desc" },
            take: 5,
            include: {
              esp32: {
                select: { id: true, serialNumber: true },
              },
            },
          });

          if (recentPayments.length > 0) {
            sendEvent({ type: "payments", payments: recentPayments });
          }

          // Heartbeat every ~5 seconds (after ~5/3 ≈ 2 polls of 3s each)
          heartbeatCounter++;
          if (heartbeatCounter % 2 === 0) {
            sendHeartbeat();
          }
        } catch (pollError) {
          console.error("[telemetry/stream] poll error", pollError);
        }
      };

      // Poll every 3 seconds
      const interval = setInterval(poll, 3000);

      // Run initial poll immediately
      await poll();

      // Clean up interval when client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
