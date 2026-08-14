// BATTLE HOUSE — Phone/Email Verification Worker (Cloudflare Workers)
// Deploy: dash.cloudflare.com → Workers → Create → paste this → add env vars:
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_VERIFY_SID  (twilio.com → Verify → create a Verify Service)
//   RESEND_KEY (resend.com — free tier) for the email confirmation
// Then in vote/index.html set: const VERIFY_API='https://YOUR-WORKER.workers.dev';
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url); const body = await req.json().catch(() => ({}));
    const tw = (path, form) => fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}/${path}`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(env.TWILIO_SID + ':' + env.TWILIO_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form)
    }).then(r => r.json());
    if (url.pathname.endsWith('/start')) {
      await tw('Verifications', { To: '+1' + body.phone.slice(-10), Channel: 'sms' });          // sends the real text
      if (body.email && env.RESEND_KEY) await fetch('https://api.resend.com/emails', {          // sends confirm email
        method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Battle House <vip@battlehouselive.com>', to: body.email,
          subject: '🎟 Confirm your Battle House VIP invite',
          html: '<h2>You are almost in.</h2><p>Confirm your email to lock your VIP pass:</p><p><a href="https://battlehouse.tv/vote/?confirmed=1">CONFIRM MY EMAIL →</a></p>' })
      });
      return new Response(JSON.stringify({ sent: true }), { headers: cors });
    }
    if (url.pathname.endsWith('/check')) {
      const r = await tw('VerificationCheck', { To: '+1' + body.phone.slice(-10), Code: body.code });
      return new Response(JSON.stringify({ approved: r.status === 'approved' }), { headers: cors });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }
};
