const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Map common question keywords to SQL queries
function buildQuery(question) {
  const q = question.toLowerCase();

  // Vendor-specific query
  const vendorPatterns = [
    'calamari','adobe','slack','github','chatgpt','openai','claude','anthropic',
    'google','azure','n8n','perplexity','zoom','figma','sentry','twilio',
    'mailchimp','cloudflare','fingerprint','raygun','teramind','linkedin',
    'dropbox','bitly','expressvpn','maxmind','intelius','enformion',
    'stichdata','quickbooks','vercel','railway','metricool','manychat',
    'heygen','browserstack','van par','calamari','semrush','teamtailor',
    'boldsite','backlinks','the hoth'
  ];

  for (const vendor of vendorPatterns) {
    if (q.includes(vendor)) {
      return {
        type: 'vendor',
        vendor: vendor,
        sql: `SELECT month_label, proveedor, memo, monto, categoria, subcategoria, tipo_pago, recurrencia, cobertura_inicio, cobertura_fin
              FROM transactions
              WHERE LOWER(proveedor) ILIKE '%${vendor}%'
              AND estado = 'ok'
              ORDER BY fecha DESC
              LIMIT 50`
      };
    }
  }

  // Annual cost query
  if (q.includes('año') || q.includes('anual') || q.includes('annual') || q.includes('12 mes')) {
    return {
      type: 'annual',
      sql: `SELECT proveedor, categoria, subcategoria,
              SUM(monto) as total_anual,
              COUNT(*) as num_transacciones,
              MIN(fecha) as primera_fecha,
              MAX(fecha) as ultima_fecha
            FROM transactions
            WHERE estado = 'ok'
            AND monto > 0
            GROUP BY proveedor, categoria, subcategoria
            ORDER BY total_anual DESC
            LIMIT 30`
    };
  }

  // Category query
  const categoryMap = {
    'payroll': 'PAYROLL', 'nomina': 'PAYROLL', 'nómina': 'PAYROLL',
    'technology': 'TECHNOLOGY', 'tecnologia': 'TECHNOLOGY', 'tecnología': 'TECHNOLOGY',
    'marketing': 'MARKETING',
    'advertising': 'ADVERTISING', 'publicidad': 'ADVERTISING', 'ads': 'ADVERTISING',
    'ai tools': 'AI TOOLS', 'ia': 'AI TOOLS', 'inteligencia artificial': 'AI TOOLS',
    'phones': 'PHONES', 'telefon': 'PHONES',
    'servers': 'SERVERS',
    'subscriptions': 'SUBSCRIPTIONS', 'suscripciones': 'SUBSCRIPTIONS',
    'taxes': 'TAXES', 'impuestos': 'TAXES',
    'others': 'OTHERS', 'otros': 'OTHERS'
  };

  for (const [keyword, cat] of Object.entries(categoryMap)) {
    if (q.includes(keyword)) {
      // Check if asking about a specific month
      const months = ['january','february','march','april','may','june','july',
                      'august','september','october','november','december',
                      'enero','febrero','marzo','abril','mayo','junio',
                      'julio','agosto','septiembre','octubre','noviembre','diciembre'];
      let monthFilter = '';
      for (const month of months) {
        if (q.includes(month)) {
          monthFilter = `AND LOWER(month_label) ILIKE '%${month}%'`;
          break;
        }
      }
      return {
        type: 'category',
        category: cat,
        sql: `SELECT month_label, proveedor, subcategoria, SUM(monto) as total, tipo_pago
              FROM transactions
              WHERE categoria = '${cat}'
              AND estado = 'ok'
              ${monthFilter}
              GROUP BY month_label, proveedor, subcategoria, tipo_pago
              ORDER BY month_label DESC, total DESC
              LIMIT 50`
      };
    }
  }

  // Accrual query
  if (q.includes('accrual') || q.includes('devengo') || q.includes('diferido')) {
    return {
      type: 'accrual',
      sql: `SELECT month_label, proveedor, categoria, subcategoria, monto, cobertura_inicio, cobertura_fin, recurrencia
            FROM transactions
            WHERE tipo_pago = 'Accrual'
            AND estado = 'ok'
            ORDER BY fecha DESC
            LIMIT 50`
    };
  }

  // Burn rate / total query
  if (q.includes('burn rate') || q.includes('total') || q.includes('gasto total') || q.includes('cuanto gastamos')) {
    return {
      type: 'summary',
      sql: `SELECT month_label, categoria,
              SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END) as gastos,
              SUM(CASE WHEN monto < 0 THEN monto ELSE 0 END) as reembolsos,
              SUM(monto) as neto
            FROM transactions
            WHERE estado = 'ok'
            AND conciliado = 'si'
            GROUP BY month_label, categoria
            ORDER BY month_label DESC, gastos DESC
            LIMIT 60`
    };
  }

  // Default: return recent transactions summary
  return {
    type: 'general',
    sql: `SELECT month_label, categoria, subcategoria,
            SUM(monto) as total,
            COUNT(*) as transacciones
          FROM transactions
          WHERE estado = 'ok'
          AND conciliado = 'si'
          GROUP BY month_label, categoria, subcategoria
          ORDER BY month_label DESC, total DESC
          LIMIT 40`
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { question } = JSON.parse(event.body);
    const query = buildQuery(question);

    // Execute query against Supabase
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/execute_query`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query_text: query.sql })
      }
    );

    // If RPC not available, use direct table query
    if (!response.ok) {
      // Fallback: query via PostgREST
      const tableResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/transactions?select=month_label,proveedor,memo,monto,categoria,subcategoria,tipo_pago,recurrencia&estado=eq.ok&conciliado=eq.si&order=fecha.desc&limit=100`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );
      const data = await tableResponse.json();
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ type: query.type, data, sql: query.sql })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ type: query.type, data, sql: query.sql })
    };
  } catch(e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
