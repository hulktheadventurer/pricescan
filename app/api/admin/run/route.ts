import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

/**
 * POST /api/admin/run
 * Body: { job: "job:fetcher" | "job:alerts" }
 *
 * Dev: allowed without secret.
 * Prod: requires header `x-admin-secret: <ADMIN_SECRET>`
 */
export async function POST(req: NextRequest) {
  const { job } = (await req.json()) as { job?: string };

  if (!job || !["job:fetcher", "job:alerts"].includes(job)) {
    return new NextResponse("Invalid job", { status: 400 });
  }

  const isProd = process.env.NODE_ENV === "production";
  const headerSecret = req.headers.get("x-admin-secret");
  const adminSecret = process.env.ADMIN_SECRET || "";

  if (isProd) {
    if (!adminSecret || headerSecret !== adminSecret) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  // Spawn the npm script
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", job], {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
  });

  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });

  return NextResponse.json({ ok: true, job, output });
}
