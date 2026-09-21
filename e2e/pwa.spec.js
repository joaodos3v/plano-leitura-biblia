// Verifica o que torna o app instalavel no iPhone e utilizavel sem internet.

const { test, expect } = require('./fixtures');
const { openApp } = require('./helpers');

test.describe('PWA', () => {
  test('o manifest e valido e aponta para icones que existem', async ({ page, request }) => {
    await openApp(page);

    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBe('manifest.json');

    const manifest = await (await request.get('/manifest.json')).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.theme_color).toBe('#7a5c3e');
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // nome sob o icone

    // precisa de 192 e 512, e de ao menos um maskable
    const tamanhos = manifest.icons.map(i => i.sizes);
    expect(tamanhos).toContain('192x192');
    expect(tamanhos).toContain('512x512');
    expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true);

    for (const icone of manifest.icons) {
      const resp = await request.get('/' + icone.src);
      expect(resp.status(), `${icone.src} deve existir`).toBe(200);
      expect(resp.headers()['content-type']).toContain('image/png');
    }
  });

  test('o iPhone tem o que precisa para instalar na tela de inicio', async ({ page, request }) => {
    await openApp(page);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#7a5c3e');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);

    const apple = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    expect((await request.get('/' + apple)).status()).toBe(200);
  });

  test('respeita a area segura do iPhone em modo standalone', async ({ page }) => {
    await openApp(page);
    const usaSafeArea = await page.evaluate(() => {
      const wrap = document.querySelector('.wrap');
      // o valor computado resolve env() para 0 no desktop, mas a regra tem de existir
      return [...document.styleSheets]
        .flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } })
        .some(r => r.selectorText === '.wrap' && r.style.padding.includes('safe-area-inset'));
    });
    expect(usaSafeArea).toBe(true);
  });

  test.describe('service worker', () => {
    test.use({ serviceWorkers: 'allow' });

    test('registra e serve o app sem internet', async ({ page, context }) => {
      await openApp(page);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null || true);

      // espera o worker assumir o controle
      await page.waitForFunction(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!(reg && (reg.active || reg.installing || reg.waiting));
      });
      const reg = await page.evaluate(async () => {
        const r = await navigator.serviceWorker.ready;
        return { escopo: r.scope, ativo: !!r.active };
      });
      expect(reg.ativo).toBe(true);
      expect(reg.escopo).toContain('localhost:8000');

      // agora offline: o app ainda tem de abrir
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('h1')).toHaveText('Plano de Leitura da Biblia');
      await context.setOffline(false);
    });
  });
});
