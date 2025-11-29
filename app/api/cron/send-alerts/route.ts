import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log("📩 Cron: Sending alerts...");

  const { data: alerts } = await supabase
    .from("pending_alerts")
    .select("*");

  for (const a of alerts || []) {
    await resend.emails.send({
      from: process.env.ALERT_FROM!,
      to: process.env.ALERT_TO!,
      subject: "Price Drop Alert",
      html: `<p>The product below has dropped in price:</p><p>${a.message}</p>`,
    });

    await supabase.from("pending_alerts").delete().eq("id", a.id);
  }

  return NextResponse.json({ success: true });
}
