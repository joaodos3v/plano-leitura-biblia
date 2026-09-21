// Todo teste importa `test` daqui, nunca de '@playwright/test' direto.
// A fixture e `auto`, entao instala o Supabase falso antes de qualquer
// navegacao mesmo que o teste nao peca nada -- nenhum teste consegue
// esquecer de mockar e acabar escrevendo na producao.

const base = require('@playwright/test');
const { instalarFakeSupabase, USUARIO, SENHA } = require('./fake-supabase');

const test = base.test.extend({
  // `supabase` e o armazenamento em memoria do falso: o teste pode inspecionar
  // o que foi gravado ou quais rotas foram chamadas.
  supabase: [async ({ page }, use) => {
    const store = await instalarFakeSupabase(page);
    await use(store);
  }, { auto: true }]
});

module.exports = { test, expect: base.expect, USUARIO, SENHA };
