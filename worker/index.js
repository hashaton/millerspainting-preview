// Millers Painting website: serves the static site and handles the estimate form.
// POST /api/contact  ->  validates the request and emails it to the owner's inbox
// through Cloudflare Email Routing (free, no third-party service, no monthly cap).
import { EmailMessage } from "cloudflare:email";

const LIMITS = { name: 100, phone: 30, email: 254, city: 60, services: 200, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  // Only accept submissions from this site's own pages.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  let data;
  try {
    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > 20000) return json({ ok: false, error: "Too large" }, 413);
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success so bots move on.
  if (data.botcheck) return json({ ok: true });

  const f = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    f[key] = String(data[key] ?? "").trim().slice(0, max);
  }
  const digits = f.phone.replace(/\D/g, "");
  if (!f.name) return json({ ok: false, error: "Name is required" }, 422);
  if (digits.length < 10) return json({ ok: false, error: "Phone is required" }, 422);
  const emailOk = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(f.email);
  if (f.email && !emailOk) return json({ ok: false, error: "Invalid email" }, 422);

  const subject = `New estimate request from ${oneLine(f.name)}`;
  const body = [
    "New estimate request from the website",
    "",
    `Name:      ${f.name}`,
    `Phone:     ${f.phone}`,
    `Email:     ${f.email || "(not given)"}`,
    `City:      ${f.city || "(not given)"}`,
    `Services:  ${f.services || "Not specified"}`,
    "",
    "Project details:",
    f.message || "(none)",
    "",
    "--",
    f.email ? "Reply to this email to answer the customer directly." : "The customer didn't leave an email. Call or text them back.",
  ].join("\r\n");

  const raw = buildMime({
    from: `Millers Painting Website <${env.FROM_ADDRESS}>`,
    to: env.TO_ADDRESS,
    replyTo: emailOk ? f.email : null,
    subject,
    body,
    domain: env.FROM_ADDRESS.split("@")[1],
  });

  try {
    await env.CONTACT_EMAIL.send(new EmailMessage(env.FROM_ADDRESS, env.TO_ADDRESS, raw));
  } catch (err) {
    console.error("send_email failed:", err && err.message);
    return json({ ok: false, error: "Could not send" }, 502);
  }
  return json({ ok: true });
}

// Strip CR/LF so user input can never inject extra email headers.
function oneLine(s) {
  return String(s).replace(/[\r\n]+/g, " ");
}

// RFC 2047 encoding so names and subjects with accents or emoji display correctly.
function encodeHeader(s) {
  s = oneLine(s);
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildMime({ from, to, replyTo, subject, body, domain }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${oneLine(replyTo)}` : null,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const encoded = b64(body).replace(/.{1,76}/g, "$&\r\n");
  return headers.join("\r\n") + "\r\n\r\n" + encoded;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}
