const { expect, USUARIO, SENHA } = require('./fixtures');

// Abre o app com o localStorage zerado, para cada teste partir do estado
// semeado em <script id="planData"> e nao do que um teste anterior deixou.
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

// Faz login pela propria tela do app, contra o Supabase falso.
async function login(page, email = USUARIO.email, senha = SENHA) {
  await page.fill('#loginEmail', email);
  await page.fill('#loginPass', senha);
  await page.click('#loginBtn');
}

// Abre o app ja logado e sincronizado, pronto para exercitar o plano.
async function openLoggedIn(page) {
  await openApp(page);
  await login(page);
  await expect(page.locator('#loginOverlay')).toBeHidden();
  await expect(page.locator('#userbar')).toBeVisible();
  await expect(page.locator('#syncState')).toHaveText('sincronizado');
  await page.waitForFunction(
    () => document.querySelectorAll('input[data-kind="plan"]').length > 0
  );
}

module.exports = { openApp, login, openLoggedIn };
