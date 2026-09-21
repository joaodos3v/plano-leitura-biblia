// Supabase falso, em memoria, servido por interceptacao de rede.
//
// Existe por um motivo concreto: quando os testes rodavam contra o projeto de
// verdade, um deles apagou os capitulos de um dia futuro do plano real. Nenhum
// teste pode alcancar a producao, entao TODA chamada ao dominio do Supabase e
// atendida aqui -- e o que nao for reconhecido falha alto, em vez de vazar.

const HOST_SUPABASE = '**bsbodpkhnkydsmqypiem.supabase.co/**';

const USUARIO = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'teste@exemplo.local',
  aud: 'authenticated',
  role: 'authenticated'
};
const SENHA = 'senha-de-teste';

function sessao() {
  return {
    access_token: 'token-falso-de-teste',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresh-falso-de-teste',
    user: USUARIO
  };
}

function json(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

// Instala o falso numa page. Devolve o armazenamento em memoria, para o teste
// inspecionar ou pre-carregar o que quiser.
async function instalarFakeSupabase(page) {
  const store = { linha: null, chamadas: [] };

  await page.route(HOST_SUPABASE, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const caminho = url.pathname;
    const metodo = req.method();
    store.chamadas.push(`${metodo} ${caminho}`);

    // ---- Auth ----
    if (caminho === '/auth/v1/token') {
      const tipo = url.searchParams.get('grant_type');
      if (tipo === 'refresh_token') return route.fulfill(json(sessao()));
      const corpo = req.postDataJSON() || {};
      const ok = corpo.email === USUARIO.email && corpo.password === SENHA;
      if (!ok) {
        return route.fulfill(json({
          code: 400,
          error_code: 'invalid_credentials',
          error: 'invalid_grant',
          msg: 'Invalid login credentials',
          error_description: 'Invalid login credentials',
          message: 'Invalid login credentials'
        }, 400));
      }
      return route.fulfill(json(sessao()));
    }
    if (caminho === '/auth/v1/user') return route.fulfill(json(USUARIO));
    if (caminho === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });

    // ---- Tabela bible_progress ----
    if (caminho === '/rest/v1/bible_progress') {
      const querObjeto = (req.headers()['accept'] || '').includes('pgrst.object');

      if (metodo === 'GET') {
        if (store.linha) {
          return route.fulfill(json(querObjeto ? store.linha : [store.linha]));
        }
        // maybeSingle() sem linha espera 406/PGRST116; sem o header, lista vazia
        return querObjeto
          ? route.fulfill(json({ code: 'PGRST116', message: 'no rows' }, 406))
          : route.fulfill(json([]));
      }
      if (metodo === 'POST') {          // insert do primeiro acesso
        store.linha = { ...req.postDataJSON() };
        return route.fulfill({ status: 201, body: '' });
      }
      if (metodo === 'PATCH') {         // update de uma coluna
        store.linha = { ...(store.linha || {}), ...req.postDataJSON() };
        return route.fulfill({ status: 204, body: '' });
      }
    }

    // Qualquer outra coisa e um buraco no falso: falhar alto, nunca vazar.
    console.error(`[fake-supabase] rota nao prevista: ${metodo} ${caminho}`);
    return route.fulfill(json({ message: `rota nao prevista: ${metodo} ${caminho}` }, 500));
  });

  return store;
}

module.exports = { instalarFakeSupabase, USUARIO, SENHA, HOST_SUPABASE };
