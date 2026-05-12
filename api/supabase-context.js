const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const sbHeaders = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    };

    // Fetch business_context
    const r1 = await fetch(
      `${SUPABASE_URL}/rest/v1/business_context?select=seccion,campo,valor,notas&order=seccion`,
      { headers: sbHeaders }
    );
    const ctx = await r1.json();

    // Fetch vendors
    const r2 = await fetch(
      `${SUPABASE_URL}/rest/v1/vendors?select=vendor,categoria,status,monto_mensual_real,frecuencia,fecha_fin_renovacion,notas&order=vendor`,
      { headers: sbHeaders }
    );
    const vendors = await r2.json();

    // Build context string
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ context: out, rows: ctx.length, vendors: vendors.length })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message, context: '' })
    };
  }
};
