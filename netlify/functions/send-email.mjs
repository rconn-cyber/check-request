export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const { action } = payload;

  // ── SEND EMAIL ──────────────────────────────────────────────
  if (!action || action === 'send-email') {
    const key = Netlify.env.get('RESEND_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const { to, subject, html } = payload;
    if (!to || !subject || !html) return new Response(JSON.stringify({ error: 'Missing to, subject, or html' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          from: 'Rough Riders Check Request <r.conn@tamparoughriders.org>',
          to: Array.isArray(to) ? to : [to],
          subject, html
        })
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // ── ANALYZE RECEIPT ─────────────────────────────────────────
  if (action === 'analyze-receipt') {
    const key = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const { base64, mediaType } = payload;
    if (!base64 || !mediaType) return new Response(JSON.stringify({ error: 'Missing base64 or mediaType' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const contentBlock = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } };

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: [
              contentBlock,
              {
                type: 'text',
                text: `You are reviewing a receipt or invoice submitted with a nonprofit check request. Extract key details and assess legitimacy. Reply ONLY with a JSON object, no markdown, no preamble:
{
  "vendor": "vendor or payee name, or Unknown",
  "date": "date on receipt MM/DD/YYYY or Unknown",
  "amount": "total amount with $ sign or Unknown",
  "description": "brief description of what was purchased (max 12 words)",
  "flag": "ok | warn | err",
  "flag_label": "Looks legitimate | Review recommended | Concerns found",
  "notes": "1-2 sentence assessment for the approver. Note any missing info, illegible areas, mismatched amounts, or anything unusual."
}`
              }
            ]
          }]
        })
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
};
