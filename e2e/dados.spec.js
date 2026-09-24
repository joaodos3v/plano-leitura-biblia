// Integridade do planData. O devocional e o plano foram transcritos a mao e ja
// tiveram erro de digitacao (23/09 vinha como Mateus 16 em vez de Mateus 6).
// Estes testes nao julgam quais capitulos sao os certos -- garantem que o
// conjunto continua fechando: nada sem leitura prevista, nada lido duas vezes.

const { test, expect } = require('./fixtures');
const { openApp } = require('./helpers');

test.describe('integridade do plano', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('a Biblia inteira esta coberta, sem sobra nem duplicata', async ({ page }) => {
    const r = await page.evaluate(() => {
      const k = ([b, c]) => b + '|' + c;
      const todos = new Set(D.all_chapters.map(k));
      const devo = new Set(D.devo_schedule.map(d => k([d.book, d.ch])));
      const baseline = new Set(D.initial_read.map(k));

      const plano = [];
      Object.values(D.plan_assignment).forEach(chs => chs.forEach(c => plano.push(k(c))));

      const cobertos = new Set([...devo, ...baseline, ...plano]);
      return {
        totalBiblia: todos.size,
        semCobertura: [...todos].filter(c => !cobertos.has(c)),
        planoDuplicado: plano.length - new Set(plano).size,
        devoDentroDoPlano: [...devo].filter(c => new Set(plano).has(c)),
        foraDoCanon: [...cobertos].filter(c => !todos.has(c))
      };
    });

    expect(r.totalBiblia).toBe(1189);
    expect(r.semCobertura).toEqual([]);      // nenhum capitulo ficou de fora
    expect(r.planoDuplicado).toBe(0);        // nenhum capitulo lido duas vezes no plano
    expect(r.devoDentroDoPlano).toEqual([]); // devocional e plano nao se sobrepoem
    expect(r.foraDoCanon).toEqual([]);       // nenhum "Mateus 29" inventado
  });

  test('todo capitulo citado existe de verdade naquele livro', async ({ page }) => {
    const invalidos = await page.evaluate(() => {
      const ruins = [];
      const checa = (b, c, onde) => {
        const max = D.chapters_per_book[b];
        if (!max) ruins.push(`livro desconhecido: ${b} (${onde})`);
        else if (c < 1 || c > max) ruins.push(`${b} ${c} nao existe, tem ${max} (${onde})`);
      };
      D.devo_schedule.forEach(d => checa(d.book, d.ch, 'devocional ' + d.date));
      Object.entries(D.plan_assignment).forEach(([dt, chs]) =>
        chs.forEach(([b, c]) => checa(b, c, 'plano ' + dt))
      );
      D.initial_read.forEach(([b, c]) => checa(b, c, 'baseline'));
      return ruins;
    });
    expect(invalidos).toEqual([]);
  });

  test('o devocional tem 67 dias e o rotulo bate com o capitulo', async ({ page }) => {
    const r = await page.evaluate(() => ({
      dias: D.devo_schedule.length,
      rotulosErrados: D.devo_schedule
        .filter(d => d.label !== `${d.book} ${d.ch}`)
        .map(d => `${d.date}: label ${d.label} != ${d.book} ${d.ch}`)
    }));
    expect(r.dias).toBe(67);
    expect(r.rotulosErrados).toEqual([]);
  });

  test('23 de setembro e Mateus 6', async ({ page }) => {
    const d = await page.evaluate(
      () => D.devo_schedule.find(x => x.date === '2026-09-23')
    );
    expect(d.book).toBe('Mateus');
    expect(d.ch).toBe(6);
    expect(d.label).toBe('Mateus 6');
  });
});
