const { expect } = require('@playwright/test');

const EMAIL = process.env.PLANO_EMAIL;
const PASSWORD = process.env.PLANO_PASSWORD;

const hasCredentials = Boolean(EMAIL && PASSWORD);

// Abre o app com o localStorage zerado, para cada teste partir do estado semeado
// em <script id="planData"> e nao do que um teste anterior deixou gravado.
async function openApp(page) {
  // addInitScript roda em TODA navegacao, inclusive num reload(). Limpar sempre
  // apagaria o progresso no meio do teste e, pior, o token de sessao do
  // Supabase -- entao a limpeza acontece so na primeira carga da aba.
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__e2e_limpo__')) {
        localStorage.clear();
        sessionStorage.setItem('__e2e_limpo__', '1');
      }
    } catch (e) {}
  });
  await page.goto('/index.html');
}

// Faz login pela propria tela do app e espera o plano renderizar.
async function login(page) {
  await page.fill('#loginEmail', EMAIL);
  await page.fill('#loginPass', PASSWORD);
  await page.click('#loginBtn');
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#userbar')).toBeVisible();
  await page.waitForFunction(
    () => document.querySelectorAll('input[data-kind="plan"]').length > 0
  );
}

// Abre o app ja logado e sincronizado, pronto para exercitar o plano.
async function openLoggedIn(page) {
  await openApp(page);
  await login(page);
  await expect(page.locator('#syncState')).toHaveText('sincronizado', { timeout: 15000 });
}

// Os testes abaixo escrevem na MESMA linha do Supabase que o app real usa.
// Por isso todo teste que muda estado tira um snapshot antes e devolve tudo
// no lugar depois, para nao estragar o progresso de leitura de verdade.
async function snapshot(page) {
  return page.evaluate(() => ({
    assignment: JSON.parse(JSON.stringify(planAssignment)),
    plan: [...planChecked],
    devo: [...devoChecked]
  }));
}

async function restore(page, snap) {
  await page.evaluate(async (s) => {
    planAssignment = s.assignment;
    planChecked = new Set(s.plan);
    devoChecked = new Set(s.devo);
    await saveAssignment();
    await savePlanChecked();
    await saveDevoChecked();
  }, snap);
}

module.exports = {
  EMAIL, PASSWORD, hasCredentials, openApp, login, openLoggedIn, snapshot, restore
};
