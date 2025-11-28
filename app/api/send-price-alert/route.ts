import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// Environment variables
const resend = new Resend(process.env.RESEND_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId, product_name, current_price, target_price, email } = await req.json();

    if (!email || !product_name) {
      return NextResponse.json({ error: "Missing email or product info" }, { status: 400 });
    }

    // Send the email alert
    await resend.emails.send({
      from: "PriceScan Alerts <alerts@pricescan.ai>",
      to: email,
      subject: `🔥 Price Drop Alert: ${product_name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:20px;border-radius:8px;">
          <h2 style="color:#2563eb;">Price Drop Alert!</h2>
          <p>Hi there 👋</p>
          <p>The product you’re tracking has dropped below your target price:</p>
          <h3>${product_name}</h3>
          <p>💰 Current Price: <b>£${current_price}</b></p>
          <p>🎯 Your Target Price: £${target_price}</p>
          <p>You can view it directly here:</p>
          <a href="https://pricescan.ai" style="display:inline-block;padding:10px 16px;background:#2563eb;color:white;border-radius:6px;text-decoration:none;">View on PriceScan</a>
          <p style="margin-top:20px;font-size:13px;color:#666;">— The PriceScan Team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Email send failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
