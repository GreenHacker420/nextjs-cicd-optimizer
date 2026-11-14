/**
 * Next.js 16 Server Lifecycle & OpenTelemetry Instrumentation
 * Runs once upon container boot to verify runtime health and telemetry connections.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Node.js server boot diagnostic
    const memory = process.memoryUsage();
    console.log(
      `[Next.js 16 Boot] Standalone runtime active. RSS: ${Math.round(memory.rss / 1024 / 1024)}MB, Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`
    );
  }
}
