require("dotenv").config();

async function sendTestEmail() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM;
  const to = process.env.ALERT_TO;

  if (!key || !from || !to) {
    console.error("❌ Missing email env variables");
    process.exit(1);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "📦 PriceScan Test Email",
      html: "<h2>Email system is working 🎉</h2><p>Your backend is alive!</p>",
    }),
  });

  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}

sendTestEmail();
