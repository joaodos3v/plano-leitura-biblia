// Botao "Hoje" e a secao recolhida dos dias que ja passaram.

const { test, expect } = require('./fixtures');
const { openLoggedIn, expandirPassados } = require('./helpers');

test.describe('navegacao pela lista', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('os dias anteriores comecam recolhidos', async ({ page }) => {
    const hoje = await page.evaluate(() => todayISO());
    const passadosNaTela = await page.evaluate(
      (h) => [...document.querySelectorAll('.day-card')].map(c => c.dataset.date).filter(d => d < h),
      hoje
    );
    expect(passadosNaTela).toEqual([]);

    // mas o dia de hoje e os seguintes estao visiveis
    await expect(page.locator(`.day-card[data-date="${hoje}"]`)).toBeVisible();
  });

  test('o botao da secao diz quantos dias ela esconde, e abre e fecha', async ({ page }) => {
    const hoje = await page.evaluate(() => todayISO());
    const quantos = await page.evaluate((h) => D.dates.filter(d => d < h).length, hoje);

    const toggle = page.locator('#pastToggle');
    await expect(toggle).toContainText(`${quantos} dias anteriores`);

    await toggle.click();
    await expect(page.locator(`.day-card[data-date="${await page.evaluate(() => D.dates[0])}"]`)).toBeVisible();

    await toggle.click();
    await expect(page.locator(`.day-card[data-date="${await page.evaluate(() => D.dates[0])}"]`)).toHaveCount(0);
  });

  test('uma busca mostra tambem os dias passados, senao pareceria nao achar nada', async ({ page }) => {
    const primeiro = await page.evaluate(() => D.dates[0]);
    const rotulo = await page.evaluate(d => fmtDate(d), primeiro);

    await page.fill('#searchPlan', rotulo);
    await expect(page.locator(`.day-card[data-date="${primeiro}"]`)).toBeVisible();
    // com busca ativa a secao recolhida nem aparece
    await expect(page.locator('#pastToggle')).toHaveCount(0);
  });

  test('o botao Hoje leva ate o dia de hoje', async ({ page }) => {
    await expandirPassados(page);   // joga hoje para longe, no fim da lista
    const hoje = await page.evaluate(() => todayISO());

    await page.locator('#goToday').click();
    await expect(page.locator(`.day-card[data-date="${hoje}"]`)).toBeInViewport();
  });

  test('o botao Hoje limpa a busca se ela estiver escondendo o dia', async ({ page }) => {
    const hoje = await page.evaluate(() => todayISO());
    await page.fill('#searchPlan', 'zzz-nao-existe');
    await expect(page.locator(`.day-card[data-date="${hoje}"]`)).toHaveCount(0);

    await page.locator('#goToday').click();
    await expect(page.locator('#searchPlan')).toHaveValue('');
    await expect(page.locator(`.day-card[data-date="${hoje}"]`)).toBeVisible();
  });
});
