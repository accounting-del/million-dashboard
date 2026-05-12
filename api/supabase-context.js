export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sbHeaders = {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
    };

    const [r1, r2] = await Promise.all([
      fetch(`${process.env.SUPABASE_URL}/rest/v1/business_context?select=seccion,campo,valor,notas&order=seccion`, { headers: sbHeaders }),
      fetch(`${process.env.SUPABASE_URL}/rest/v1/vendors?select=vendor,categoria,status,monto_mensual_real,frecuencia,fecha_fin_renovacion,notas&order=vendor`, { headers: sbHeaders })
    ]);

    const ctx = await r1.json();
    const vendors = await r2.json();

    let out = '=== CONTEXTO DEL NEGOCIO ===\n';
    const secs = {};
    ctx.forEach(r => {
      if (!secs[r.seccion]) secs[r.seccion] = [];
      secs[r.seccion].push(`${r.campo}: ${r.valor}${r.notas ? ' (' + r.notas + ')' : ''}`);
    });
    Object.keys(secs).forEach(s => {
      out += `\n[${s}]\n` + secs[s].join('\n') + '\n';
    });

    out += '\n=== VENDORS ACTIVOS ===\n';
    vendors.filter(v => v.status === 'Activo').forEach(v => {
      out += `${v.vendor} (${v.categoria}): ${v.monto_mensual_real || '—'}`;
      if (v.fecha_fin_renovacion && v.fecha_fin_renovacion !== 'Sin vencimiento')
        out += ` · vence ${v.fecha_fin_renovacion}`;
      if (v.notas && v.notas.includes('⚠'))
        out += ` · ${v.notas}`;
      out += '\n';
    });

    const cancelados = vendors.filter(v => v.status === 'Cancelado');
    if (cancelados.length)
      out += '\n[CANCELADOS] ' + cancelados.map(v => v.vendor).join(', ') + '\n';

    return res.status(200).json({ context: out, rows: ctx.length, vendors: vendors.length });
  } catch(e) {
    return res.status(500).json({ error: e.message, context: '' });
  }
}
