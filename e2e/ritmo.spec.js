// Modo "Por ritmo": N capitulos por dia, estendendo o calendario quantos dias
// forem precisos, em vez de espremer tudo ate 31/12.

const { test, expect } = require('./fixtures');
const { openLoggedIn } = require('./helpers');

const estado = (page) => page.evaluate(() => {
  const dias = diasDoPlano();
  const abertos = dias.filter(d => d >= todayISO() && !planChecked.has(d));
  const comLeitura = dias.filter(d => (planAssignment[d] || []).length > 0);
  return {
    modo: viewMode,
    ritmo: chaptersPerDay,
    ultimoDiaDoCalendario: D.dates[D.dates.length - 1],
    fim: comLeitura.length ? comLeitura[comLeitura.length - 1] : null,
    cargas: abertos.map(d => (planAssignment[d] || []).length),
    total: dias.reduce((n, d) => n + (planAssignment[d] || []).length, 0),
    concluidos: dias.filter(d => planChecked.has(d))
                    .map(d => [d, (planAssignment[d] || []).length])
  };
});

async function trocarPara(page, modo) {
  await page.locator(modo === 'ritmo' ? '#modeRitmo' : '#modePrazo').click();
  await page.click('#modalConfirm');
  await expect(page.locator('#modalOverlay')).toBeHidden();
}

test.describe('modo por ritmo', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('comeca no modo por prazo', async ({ page }) => {
    await expect(page.locator('#modePrazo')).toHaveClass(/active/);
    await expect(page.locator('#modeRitmo')).not.toHaveClass(/active/);
    await expect(page.locator('#rateBox')).toBeHidden();
  });

  test('ao trocar, todo dia aberto fica com exatamente N capitulos', async ({ page }) => {
    const antes = await estado(page);
    await trocarPara(page, 'ritmo');
    const depois = await estado(page);

    expect(depois.modo).toBe('ritmo');
    // todos os dias cheios tem N; so o ultimo pode ter menos
    const cheios = depois.cargas.filter(c => c > 0);
    expect(cheios.slice(0, -1).every(c => c === depois.ritmo)).toBe(true);
    expect(cheios[cheios.length - 1]).toBeLessThanOrEqual(depois.ritmo);
    expect(depois.total).toBe(antes.total);   // nenhum capitulo sumiu
  });

  test('estende o calendario para alem de 31/12 quando precisa', async ({ page }) => {
    await trocarPara(page, 'ritmo');
    const r = await estado(page);
    // a 5 por dia nao cabe ate 31/12, entao o plano tem de passar disso
    expect(r.fim > r.ultimoDiaDoCalendario).toBe(true);
    expect(page.locator('#modeInfo')).toBeTruthy();
    await expect(page.locator('#modeInfo')).toContainText('Termina em');
  });

  test('nao mexe nos dias ja concluidos', async ({ page }) => {
    const antes = await estado(page);
    await trocarPara(page, 'ritmo');
    const depois = await estado(page);
    expect(depois.concluidos).toEqual(antes.concluidos);
  });

  test('mudar o ritmo refaz a distribuicao', async ({ page }) => {
    await trocarPara(page, 'ritmo');
    await page.fill('#rateInput', '3');
    await page.locator('#rateInput').dispatchEvent('change');
    const r = await estado(page);
    expect(r.ritmo).toBe(3);
    const cheios = r.cargas.filter(c => c > 0);
    expect(cheios.slice(0, -1).every(c => c === 3)).toBe(true);
  });

  test('voltar para prazo reespreme ate 31/12', async ({ page }) => {
    const antes = await estado(page);
    await trocarPara(page, 'ritmo');
    await trocarPara(page, 'prazo');
    const depois = await estado(page);

    expect(depois.modo).toBe('prazo');
    expect(depois.fim <= depois.ultimoDiaDoCalendario).toBe(true);
    expect(depois.total).toBe(antes.total);
    // volta a ser uma distribuicao equilibrada
    const cheios = depois.cargas.filter(c => c > 0);
    expect(Math.max(...cheios) - Math.min(...cheios)).toBeLessThanOrEqual(1);
  });

  test('cancelar a troca nao muda nada', async ({ page }) => {
    const antes = await estado(page);
    await page.locator('#modeRitmo').click();
    await page.click('#modalCancel');
    await expect(page.locator('#modalOverlay')).toBeHidden();
    expect(await estado(page)).toEqual(antes);
    await expect(page.locator('#modePrazo')).toHaveClass(/active/);
  });

  test('a escolha chega ao banco e sobrevive ao reload', async ({ page, supabase }) => {
    await trocarPara(page, 'ritmo');
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
    expect(supabase.linha.view_mode).toBe('ritmo');

    await page.reload();
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
    await expect(page.locator('#modeRitmo')).toHaveClass(/active/);
  });

  test('a leitura continua em ordem canonica depois da troca', async ({ page }) => {
    await trocarPara(page, 'ritmo');
    const fora = await page.evaluate(() => {
      const seq = [];
      diasDoPlano().forEach(d =>
        (planAssignment[d] || []).forEach(c => seq.push(CANON_POS[key(c[0], c[1])])));
      let n = 0;
      for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) n++;
      return n;
    });
    expect(fora).toBe(0);
  });
});

test.describe('aparencia do seletor', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('cabe num celular, com alvos de toque utilizaveis', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const r = await page.evaluate(() => {
      const box = document.querySelector('.mode-box').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.mode-seg button')].map(b => b.getBoundingClientRect());
      return {
        dentroDaTela: box.left >= 0 && box.right <= 390,
        scrollLateral: document.documentElement.scrollWidth > 390,
        menorAltura: Math.round(Math.min(...btns.map(b => b.height)))
      };
    });
    expect(r.dentroDaTela).toBe(true);
    expect(r.scrollLateral).toBe(false);
    expect(r.menorAltura).toBeGreaterThanOrEqual(40);
  });

  test('o campo de ritmo so aparece no modo ritmo', async ({ page }) => {
    await expect(page.locator('#rateBox')).toBeHidden();
    await page.locator('#modeRitmo').click();
    await page.click('#modalConfirm');
    await expect(page.locator('#rateBox')).toBeVisible();
    await expect(page.locator('#rateInput')).toHaveValue('5');
  });
});
