// Testes das regras do plano de leitura.
//
// Rodam contra o Supabase falso de e2e/fake-supabase.js, nunca contra o
// projeto real: cada teste ganha um banco em memoria proprio e descartavel.

const { test, expect } = require('./fixtures');
const { openLoggedIn } = require('./helpers');

test.describe('plano de leitura', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
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
    await expect(page.locator('#syncState')).toHaveText('sincronizado');

    const depois = await page.evaluate(() => JSON.stringify(planAssignment));
    expect(depois).toBe(antes.assignment);
  });

  test('o dia marcado continua marcado depois do reload', async ({ page }) => {
    const alvo = await page.evaluate(
      () => D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length)
    );

    await page.click(`input[data-kind="plan"][data-date="${alvo}"]`);
    await expect(page.locator('#syncState')).toHaveText('sincronizado');

    await page.reload();
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
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
      .toHaveText(String(Number(lidosAntes) + quantos));
  });
});

// Regra 2: "Excluir" nao empurra os capitulos um por dia. Recolhe tudo o que
// falta ler dali em diante e reparte por igual entre os dias restantes,
// mantendo a ordem canonica.
test.describe('excluir e redistribuir', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('nao perde capitulos, esvazia o dia e mantem a carga equilibrada', async ({ page }) => {
    const r = await page.evaluate(() => {
      const abertos = () => D.dates.filter(d => !planChecked.has(d));
      const total = () => abertos().reduce((n, d) => n + (planAssignment[d] || []).length, 0);

      const alvo = abertos().find(d => (planAssignment[d] || []).length > 0);
      const antes = total();
      // Só os dias que recebem a redistribuição. Dias abertos ANTERIORES ao
      // alvo podem estar vazios de exclusões passadas e nao sao reequilibrados.
      const recebem = () => D.dates.filter(d => d > alvo && !planChecked.has(d));
      const cargasAntes = recebem().map(d => (planAssignment[d] || []).length);

      doExclude(alvo);

      const cargasDepois = recebem().map(d => (planAssignment[d] || []).length);

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

// "Li parte": o dia fica so com o que foi lido, e o restante e espalhado
// exatamente como o Excluir faz.
test.describe('li ate aqui', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('divide o dia pelo capitulo escolhido, sem perder nem desordenar', async ({ page }) => {
    const alvo = await page.evaluate(
      () => D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length > 1)
    );
    const antes = await page.evaluate(d => ({
      total: D.dates.reduce((n, x) => n + (planAssignment[x] || []).length, 0),
      doDia: planAssignment[d].length
    }), alvo);

    await page.locator(`.partial-btn[data-date="${alvo}"]`).click();
    // "li os 2 primeiros capitulos deste dia"
    await page.locator(`.chip[data-date="${alvo}"][data-lidos="2"]`).click();
    await expect(page.locator('#modalTitle')).toHaveText('Li ate aqui');
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const depois = await page.evaluate(d => {
      const seq = [];
      D.dates.forEach(x =>
        (planAssignment[x] || []).forEach(c => seq.push(CANON_POS[key(c[0], c[1])]))
      );
      let foraDeOrdem = 0;
      for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) foraDeOrdem++;
      return {
        total: D.dates.reduce((n, x) => n + (planAssignment[x] || []).length, 0),
        doDia: planAssignment[d].length,
        marcado: planChecked.has(d),
        foraDeOrdem
      };
    }, alvo);

    expect(depois.doDia).toBe(2);              // ficou so o que foi lido
    expect(depois.marcado).toBe(true);         // e o dia conta como concluido
    expect(depois.total).toBe(antes.total);    // nada sumiu
    expect(depois.foraDeOrdem).toBe(0);        // leitura segue em ordem
    expect(antes.doDia).toBeGreaterThan(2);
  });

  test('nao oferece "Li parte" num dia ja concluido', async ({ page }) => {
    const alvo = await page.evaluate(
      () => D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length > 1)
    );
    await expect(page.locator(`.partial-btn[data-date="${alvo}"]`)).toBeVisible();
    await page.click(`input[data-kind="plan"][data-date="${alvo}"]`);
    await expect(page.locator(`.partial-btn[data-date="${alvo}"]`)).toHaveCount(0);
  });
});

// Um dia FUTURO sem capitulos seria inconsistencia, entao nao pode anunciar
// "Sem capitulos do plano neste dia" -- essa nota so cabe em hoje ou no passado.
test.describe('dias sem capitulos', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('a nota de dia vazio nunca aparece num dia futuro', async ({ page }) => {
    const r = await page.evaluate(() => {
      const hoje = todayISO();
      // esvazia um dia futuro de proposito e re-renderiza
      const futuro = D.dates.find(d => d > hoje && (planAssignment[d] || []).length > 0);
      planAssignment[futuro] = [];
      renderAll();

      const cards = [...document.querySelectorAll('.day-card')];
      const comNota = cards.filter(c => c.querySelector('.empty-note'));
      const datasComNota = comNota.map(c => c.querySelector('.day-date').textContent);
      return { futuro, hoje, quantasNotas: comNota.length, datasComNota };
    });

    // nenhuma nota pode pertencer a um dia posterior a hoje
    const rotuloFuturo = await page.evaluate(d => fmtDate(d), r.futuro);
    expect(r.datasComNota).not.toContain(rotuloFuturo);
  });

  test('a nota continua aparecendo num dia passado esvaziado', async ({ page }) => {
    const temNota = await page.evaluate(() => {
      const hoje = todayISO();
      const passado = D.dates.find(d => d < hoje);
      planAssignment[passado] = [];
      renderAll();
      const card = [...document.querySelectorAll('.day-card')]
        .find(c => c.querySelector('.day-date').textContent === fmtDate(passado));
      return !!card.querySelector('.empty-note');
    });
    expect(temNota).toBe(true);
  });
});
