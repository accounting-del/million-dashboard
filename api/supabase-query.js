export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question } = req.body;
    const q = (question || '').toLowerCase();
    const sbHeaders = {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
    };

    // Build query params based on question
    let url = `${process.env.SUPABASE_URL}/rest/v1/transactions?estado=eq.ok&conciliado=eq.si&order=fecha.desc`;

    // Vendor-specific
    const vendors = ['calamari','adobe','slack','github','chatgpt','openai','claude','anthropic',
      'google','azure','n8n','perplexity','zoom','figma','sentry','twilio','mailchimp',
      'cloudflare','fingerprint','raygun','teramind','dropbox','bitly','expressvpn',
      'maxmind','intelius','quickbooks','vercel','railway','metricool','van par'];

    let type = 'general';
    for (const vendor of vendors) {
      if (q.includes(vendor)) {
        url = `${process.env.SUPABASE_URL}/rest/v1/transactions?estado=eq.ok&proveedor=ilike.*${vendor}*&order=fecha.desc&limit=50`;
        type = 'vendor';
        break;
      }
    }

    // Accrual
    if (type === 'general' && (q.includes('accrual') || q.includes('devengo'))) {
      url = `${process.env.SUPABASE_URL}/rest/v1/transactions?estado=eq.ok&tipo_pago=eq.Accrual&order=fecha.desc&limit=50`;
      type = 'accrual';
    }

    // Annual
    if (type === 'general' && (q.includes('año') || q.includes('anual'))) {
      url = `${process.env.SUPABASE_URL}/rest/v1/transactions?estado=eq.ok&conciliado=eq.si&select=month_label,proveedor,categoria,subcategoria,monto,recurrencia,tipo_pago&order=fecha.desc&limit=100`;
      type = 'annual';
    }

    const r = await fetch(url, { headers: sbHeaders });
    const data = await r.json();

    if (!data || !data.length) {
      return res.status(200).json({ type, data: [], context: '' });
    }

    // Format as text for Claude
    let out = `\n=== DATOS REALES DE SUPABASE (${type}) ===\n`;

    if (type === 'vendor') {
      const byMonth = {};
      data.forEach(row => {
        if (!byMonth[row.month_label]) byMonth[row.month_label] = [];
        byMonth[row.month_label].push(row);
      });
      Object.keys(byMonth).sort().reverse().forEach(month => {
        const rows = byMonth[month];
        const total = rows.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
        out += `${month}: $${Math.round(total).toLocaleString()}\n`;
        rows.forEach(r => {
          out += `  · ${r.proveedor} | ${r.memo || ''} | $${parseFloat(r.monto).toLocaleString()}`;
          if (r.tipo_pago === 'Accrual') out += ' [accrual]';
          if (r.recurrencia) out += ` | ${r.recurrencia}`;
          out += '\n';
        });
      });
      const grandTotal = data.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
      out += `TOTAL HISTÓRICO: $${Math.round(grandTotal).toLocaleString()}\n`;
    } else {
      data.slice(0, 30).forEach(row => {
        out += Object.entries(row)
          .filter(([k, v]) => v !== null && v !== '')
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ') + '\n';
      });
    }

    return res.status(200).json({ type, data, context: out });
  } catch(e) {
    return res.status(500).json({ error: e.message, context: '' });
  }
}
