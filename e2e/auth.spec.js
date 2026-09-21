// Testes de autenticacao. Os tres primeiros nao precisam de senha nenhuma.

const { test, expect, USUARIO } = require('./fixtures');
const { openApp, login, openLoggedIn } = require('./helpers');

test.describe('autenticacao', () => {
  test('exige login antes de mostrar o plano', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#loginOverlay')).toBeVisible();
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPass')).toBeVisible();
    // a barra de usuario so aparece depois de entrar
    await expect(page.locator('#userbar')).toBeHidden();
  });

  test('senha errada mostra mensagem em portugues e nao destrava o app', async ({ page }) => {
    await openApp(page);
    await login(page, USUARIO.email, 'senha-errada-de-proposito');

    await expect(page.locator('#loginErr')).toBeVisible();
    await expect(page.locator('#loginErr')).toHaveText('Email ou senha incorretos.');
    await expect(page.locator('#loginOverlay')).toBeVisible();
    // o botao volta a funcionar para uma nova tentativa
    await expect(page.locator('#loginBtn')).toBeEnabled();
    await expect(page.locator('#loginBtn')).toHaveText('Entrar');
  });

  test('a tela de login cabe num celular', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    const card = page.locator('.login-card');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const temScrollLateral = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(temScrollLateral).toBe(false);
  });

  test.describe('depois de entrar', () => {
    test('login entra, sincroniza e mostra o email', async ({ page }) => {
      await openLoggedIn(page);
      await expect(page.locator('#userEmail')).toHaveText(USUARIO.email);
      await expect(page.locator('#syncState')).toHaveText('sincronizado');
      await expect(page.locator('#syncState')).not.toHaveClass(/err/);
    });

    test('a sessao sobrevive ao reload, sem pedir senha de novo', async ({ page }) => {
      await openLoggedIn(page);
      await page.reload();
      await expect(page.locator('#loginOverlay')).toBeHidden();
      await expect(page.locator('#userbar')).toBeVisible();
    });

    test('sair volta para a tela de login', async ({ page }) => {
      await openLoggedIn(page);
      await page.click('#logoutBtn');
      await expect(page.locator('#loginOverlay')).toBeVisible();
      await expect(page.locator('#userbar')).toBeHidden();
    });
  });
});
