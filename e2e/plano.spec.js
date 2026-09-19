// Testes das regras do plano de leitura.
//
// ATENCAO: escrevem na mesma linha do Supabase que o app usa de verdade.
// Cada teste que muda estado restaura o snapshot no final.

const { test, expect } = require('@playwright/test');
const { openLoggedIn, hasCredentials, snapshot, restore } = require('./helpers');

test.describe('plano de leitura', () => {
  test.skip(!hasCredentials, 'defina PLANO_EMAIL e PLANO_PASSWORD para rodar');

  let snap;

  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
    snap = await snapshot(page);
  });

  test.afterEach(async ({ page }) => {
    if (snap) await restore(page, snap);
  });

  test('renderiza os dias do plano e o devocional', async ({ page }) => {
    const contagem = await page.evaluate(() => ({
      dias: D.dates.length,
      linhasDePlano: document.querySelectorAll('input[data-kind="plan"]').length,
      linhasDeDevocional: document.querySelectorAll('input[data-kind="devo"]').length,
      capitulosCanonicos: D.all_chapters.length
    }));
    expect(contagem.capitulosCanonicos).toBe(1189);
    expect(contagem.linhasDeDevocional).toBe(67);
    // um dia sem capitulos de plano nao renderiza checkbox de plano
    expect(contagem.linhasDePlano).toBeGreaterThan(0);
    expect(contagem.linhasDePlano).toBeLessThanOrEqual(contagem.dias);
  });

  // Regra 1: marcar/desmarcar e liga-desliga puro, nunca move capitulos.
  test('marcar o checkbox nao move capitulos entre os dias', async ({ page }) => {
    const antes = await page.evaluate(() => {
      const alvo = D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length);
      return { alvo, assignment: JSON.stringify(planAssignment) };
    });

    await page.click(`input[data-kind="plan"][data-date="${antes.alvo}"]`);
    await expect(page.locator('#syncState')).toHaveText('sincronizado', { timeout: 15000 });

    const depois = await page.evaluate(() => JSON.stringify(planAssignment));
    expect(depois).toBe(antes.assignment);
  });

  test('o dia marcado continua marcado depois do reload', async ({ page }) => {
    const alvo = await page.evaluate(
      () => D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length)
    );

    await page.click(`input[data-kind="plan"][data-date="${alvo}"]`);
    await expect(page.locator('#syncState')).toHaveText('sincronizado', { timeout: 15000 });

    await page.reload();
    await expect(page.locator('#syncState')).toHaveText('sincronizado', { timeout: 15000 });
    await expect(page.locator(`input[data-kind="plan"][data-date="${alvo}"]`)).toBeChecked();
  });

  test('marcar aumenta o total de capitulos lidos', async ({ page }) => {
    const lidosAntes = await page.locator('#statRead').textContent();
    const alvo = await page.evaluate(
      () => D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length)
    );
    const quantos = await page.evaluate(d => planAssignment[d].length, alvo);

    await page.click(`input[data-kind="plan"][data-date="${alvo}"]`);

    // toHaveText tem retry: nao corre contra o render nem contra a gravacao.
    await expect(page.locator('#statRead'))
      .toHaveText(String(Number(lidosAntes) + quantos), { timeout: 15000 });
  });
});

// Regra 2: "Excluir" nao empurra os capitulos um por dia. Recolhe tudo o que
// falta ler dali em diante e reparte por igual entre os dias restantes,
// mantendo a ordem canonica.
test.describe('excluir e redistribuir', () => {
  test.skip(!hasCredentials, 'defina PLANO_EMAIL e PLANO_PASSWORD para rodar');

  let snap;

  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
    snap = await snapshot(page);
  });

  test.afterEach(async ({ page }) => {
    if (snap) await restore(page, snap);
  });

  test('nao perde capitulos, esvazia o dia e mantem a carga equilibrada', async ({ page }) => {
    const r = await page.evaluate(() => {
      const abertos = () => D.dates.filter(d => !planChecked.has(d));
      const total = () => abertos().reduce((n, d) => n + (planAssignment[d] || []).length, 0);

      const alvo = abertos().find(d => (planAssignment[d] || []).length > 0);
      const antes = total();
      const cargasAntes = abertos().map(d => (planAssignment[d] || []).length);

      doExclude(alvo);

      const cargasDepois = abertos()
        .filter(d => d !== alvo)
        .map(d => (planAssignment[d] || []).length);

      return {
        antes,
        depois: total(),
        diaExcluidoVazio: (planAssignment[alvo] || []).length === 0,
        maxAntes: Math.max(...cargasAntes),
        maxDepois: Math.max(...cargasDepois),
        minDepois: Math.min(...cargasDepois)
      };
    });

    expect(r.depois).toBe(r.antes);            // nenhum capitulo some
    expect(r.diaExcluidoVazio).toBe(true);
    expect(r.maxDepois - r.minDepois).toBeLessThanOrEqual(1); // espalhado por igual
    expect(r.maxDepois).toBeLessThanOrEqual(r.maxAntes + 1);  // nao sobrecarrega ninguem
  });

  test('a leitura continua em ordem canonica e os pulados vem primeiro', async ({ page }) => {
    const r = await page.evaluate(() => {
      const abertos = () => D.dates.filter(d => !planChecked.has(d));
      const alvo = abertos().find(d => (planAssignment[d] || []).length > 0);
      const primeiroPulado = planAssignment[alvo][0];

      doExclude(alvo);

      const seq = [];
      D.dates.forEach(d =>
        (planAssignment[d] || []).forEach(c => seq.push(CANON_POS[key(c[0], c[1])]))
      );
      let foraDeOrdem = 0;
      for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) foraDeOrdem++;

      const proximo = abertos().find(d => d > alvo);
      return {
        foraDeOrdem,
        primeiroPulado,
        primeiroDoProximoDia: planAssignment[proximo][0]
      };
    });

    expect(r.foraDeOrdem).toBe(0);
    // o capitulo que ficou para tras assume a frente da fila
    expect(r.primeiroDoProximoDia).toEqual(r.primeiroPulado);
  });

  test('o modal confirma antes de mexer em qualquer coisa', async ({ page }) => {
    const antes = await page.evaluate(() => JSON.stringify(planAssignment));

    await page.locator('.exclude-btn').first().click();
    await expect(page.locator('#modalOverlay')).toBeVisible();
    await page.click('#modalCancel');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    expect(await page.evaluate(() => JSON.stringify(planAssignment))).toBe(antes);

    await page.locator('.exclude-btn').first().click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    expect(await page.evaluate(() => JSON.stringify(planAssignment))).not.toBe(antes);
  });
});
