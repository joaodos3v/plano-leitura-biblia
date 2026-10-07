// "Li mais": o inverso de "Li parte". O dia absorve capitulos dos dias
// seguintes e o restante e reequilibrado entre eles.

const { test, expect } = require('./fixtures');
const { openLoggedIn } = require('./helpers');

const diaAberto = (page) => page.evaluate(
  () => D.dates.find(d => d >= todayISO() && !planChecked.has(d) && (planAssignment[d] || []).length)
);

// Abre o menu "Li..." e escolhe uma das duas opcoes.
async function abrirFaixa(page, dt, modo) {
  await page.locator(`.partial-btn[data-date="${dt}"]`).click();
  await page.locator(`.menu-item[data-date="${dt}"][data-modo="${modo}"]`).click();
}

test.describe('li mais', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('o menu oferece "Li parte" e "Li mais"', async ({ page }) => {
    const dt = await diaAberto(page);
    await page.locator(`.partial-btn[data-date="${dt}"]`).click();
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="parte"]`)).toHaveText('Li parte');
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="mais"]`)).toHaveText('Li mais');
  });

  test('a faixa de "Li mais" mostra os capitulos dos dias seguintes', async ({ page }) => {
    const dt = await diaAberto(page);
    const previstos = await page.evaluate(d => condense(planAssignment[d]), dt);

    await abrirFaixa(page, dt, 'mais');

    const r = await page.evaluate((d) => {
      const chips = [...document.querySelectorAll(`.chip[data-date="${d}"]`)];
      return {
        primeiroLidos: Number(chips[0].dataset.lidos),
        previstoNoDia: planAssignment[d].length,
        // o primeiro chip e o capitulo logo apos o que o dia ja previa
        primeiroRotulo: chips[0].textContent.replace(/\s+/g, ' ').trim(),
        proximoDoPlano: capitulosAdiante(d)[0].join(' ')
      };
    }, dt);

    // "li tudo do dia + 1"
    expect(r.primeiroLidos).toBe(r.previstoNoDia + 1);
    expect(r.primeiroRotulo.replace(/(\D)(\d+)$/, '$1 $2')).toBe(r.proximoDoPlano);
    expect(previstos).toBeTruthy();
  });

  test('adianta os capitulos e reequilibra o resto, sem perder nem desordenar', async ({ page }) => {
    const dt = await diaAberto(page);
    const antes = await page.evaluate(d => ({
      total: D.dates.reduce((n, x) => n + (planAssignment[x] || []).length, 0),
      doDia: planAssignment[d].length
    }), dt);

    await abrirFaixa(page, dt, 'mais');
    // le 3 capitulos alem do previsto
    await page.locator(`.chip[data-date="${dt}"][data-lidos="${antes.doDia + 3}"]`).click();
    await expect(page.locator('#modalTitle')).toHaveText('Li mais');
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const depois = await page.evaluate(d => {
      const seq = [];
      D.dates.forEach(x => (planAssignment[x] || []).forEach(c => seq.push(CANON_POS[key(c[0], c[1])])));
      let foraDeOrdem = 0;
      for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) foraDeOrdem++;
      const abertos = D.dates.filter(x => x > d && !planChecked.has(x));
      const cargas = abertos.map(x => (planAssignment[x] || []).length);
      return {
        total: D.dates.reduce((n, x) => n + (planAssignment[x] || []).length, 0),
        doDia: planAssignment[d].length,
        marcado: planChecked.has(d),
        foraDeOrdem,
        desequilibrio: Math.max(...cargas) - Math.min(...cargas)
      };
    }, dt);

    expect(depois.doDia).toBe(antes.doDia + 3);   // o dia absorveu 3 capitulos
    expect(depois.marcado).toBe(true);            // e conta como concluido
    expect(depois.total).toBe(antes.total);       // nada sumiu
    expect(depois.foraDeOrdem).toBe(0);           // leitura segue em ordem
    expect(depois.desequilibrio).toBeLessThanOrEqual(1);  // resto reequilibrado
  });

  test('ler mais hoje alivia os proximos dias', async ({ page }) => {
    const dt = await diaAberto(page);
    const mediaAntes = Number(await page.locator('#statPerDay').textContent());
    const doDia = await page.evaluate(d => planAssignment[d].length, dt);

    await abrirFaixa(page, dt, 'mais');
    await page.locator(`.chip[data-date="${dt}"][data-lidos="${doDia + 5}"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const mediaDepois = Number(await page.locator('#statPerDay').textContent());
    expect(mediaDepois).toBeLessThanOrEqual(mediaAntes);
  });

  test('o adiantamento chega ao banco e sobrevive ao reload', async ({ page, supabase }) => {
    const dt = await diaAberto(page);
    const doDia = await page.evaluate(d => planAssignment[d].length, dt);

    await abrirFaixa(page, dt, 'mais');
    await page.locator(`.chip[data-date="${dt}"][data-lidos="${doDia + 2}"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#syncState')).toHaveText('sincronizado');

    expect(supabase.linha.plan_assignment[dt].length).toBe(doDia + 2);

    await page.reload();
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
    const depois = await page.evaluate(d => planAssignment[d].length, dt);
    expect(depois).toBe(doDia + 2);
  });

  test('clicar fora fecha o menu sem mudar nada', async ({ page }) => {
    const dt = await diaAberto(page);
    const antes = await page.evaluate(() => JSON.stringify(planAssignment));

    await page.locator(`.partial-btn[data-date="${dt}"]`).click();
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="mais"]`)).toBeVisible();

    await page.locator('h1').click();
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="mais"]`)).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(planAssignment))).toBe(antes);
  });
});
