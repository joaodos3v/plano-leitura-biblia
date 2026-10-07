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

// O visual quebrou uma vez: a barra nova do plano deixou o campo de busca sem
// estilo nenhum, e os dias passados abertos se misturavam com os de hoje.
test.describe('aparencia', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('o campo de busca do plano e igual ao da aba de livros', async ({ page }) => {
    const estilo = (sel) => page.evaluate((s) => {
      const cs = getComputedStyle(document.querySelector(s));
      return ['padding', 'borderRadius', 'borderWidth', 'borderStyle', 'borderColor',
              'fontSize', 'fontFamily', 'backgroundColor', 'color']
        .reduce((o, k) => (o[k] = cs[k], o), {});
    }, sel);

    await page.click('#tabBooks');          // garante que a outra aba renderizou
    await page.click('#tabPlan');

    expect(await estilo('#searchPlan')).toEqual(await estilo('#searchBook'));
  });

  test('o campo de busca do plano nao fica sem estilo', async ({ page }) => {
    const cs = await page.evaluate(() => {
      const el = document.querySelector('#searchPlan');
      const s = getComputedStyle(el);
      return { borda: s.borderStyle, raio: s.borderRadius, padding: s.paddingLeft, fundo: s.backgroundColor };
    });
    expect(cs.borda).toBe('solid');                 // input cru nao teria borda assim
    expect(parseFloat(cs.raio)).toBeGreaterThan(0); // cantos arredondados
    expect(parseFloat(cs.padding)).toBeGreaterThan(8);
    expect(cs.fundo).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('os dias anteriores abertos ficam dentro de um painel', async ({ page }) => {
    await expandirPassados(page);

    const painel = page.locator('#pastPanel');
    await expect(painel).toBeVisible();

    const r = await page.evaluate(() => {
      const p = document.querySelector('#pastPanel');
      const cs = getComputedStyle(p);
      const hoje = todayISO();
      const dentro = [...p.querySelectorAll('.day-card')].map(c => c.dataset.date);
      const fora = [...document.querySelectorAll('.day-card')]
        .filter(c => !p.contains(c)).map(c => c.dataset.date);
      return {
        bordaDoPainel: cs.borderStyle,
        fundoDoPainel: cs.backgroundColor,
        todosDentroSaoPassados: dentro.every(d => d < hoje),
        nenhumPassadoFora: fora.every(d => d >= hoje),
        quantosDentro: dentro.length
      };
    });

    expect(r.bordaDoPainel).toContain('dashed');
    expect(r.fundoDoPainel).not.toBe('rgba(0, 0, 0, 0)');  // destaca do fundo da pagina
    expect(r.todosDentroSaoPassados).toBe(true);
    expect(r.nenhumPassadoFora).toBe(true);
    expect(r.quantosDentro).toBeGreaterThan(0);
  });

  test('o painel some quando a secao e fechada', async ({ page }) => {
    await expandirPassados(page);
    await expect(page.locator('#pastPanel')).toBeVisible();
    await page.locator('#pastToggle').click();
    await expect(page.locator('#pastPanel')).toHaveCount(0);
  });
});
