// Adiar o devocional: o dia escolhido fica sem devocional e toda a fila anda
// um dia. A ORDEM dos 67 devocionais nunca muda -- so em que dia cada um cai.

const { test, expect } = require('./fixtures');
const { openLoggedIn } = require('./helpers');

// Ordem da agenda visivel, do primeiro dia ao ultimo.
const lerAgenda = (page) => page.evaluate(
  () => Object.keys(devoByDate).sort().map(d => ({ data: d, label: devoByDate[d].label }))
);

test.describe('adiar devocional', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('empurra aquele devocional e todos os seguintes em um dia', async ({ page }) => {
    const antes = await lerAgenda(page);
    const i = antes.findIndex(x => x.data >= '2026-09-24');
    const alvo = antes[i];

    await page.locator(`.devo-exclude-btn[data-date="${alvo.data}"]`).click();
    await expect(page.locator('#modalTitle')).toHaveText('Adiar devocional');
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const depois = await lerAgenda(page);

    // o dia escolhido ficou sem devocional
    expect(depois.find(x => x.data === alvo.data)).toBeUndefined();
    // o capitulo dele foi para o proximo dia da agenda
    expect(depois[i].label).toBe(alvo.label);
    // e cada um dos seguintes tambem andou uma casa
    for (let j = i; j < antes.length - 1; j++) {
      expect(depois[j].label).toBe(antes[j].label);
    }
    // os dias ANTERIORES nao se mexeram
    for (let j = 0; j < i; j++) {
      expect(depois[j]).toEqual(antes[j]);
    }
  });

  test('a ordem dos 67 devocionais e preservada', async ({ page }) => {
    const ordemOriginal = await page.evaluate(() => D.devo_schedule.map(d => d.label));

    const alvo = await page.evaluate(() => Object.keys(devoByDate).sort().find(d => d >= '2026-09-24'));
    await page.locator(`.devo-exclude-btn[data-date="${alvo}"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const agenda = await lerAgenda(page);
    expect(agenda.map(x => x.label)).toEqual(ordemOriginal.slice(0, agenda.length));
  });

  test('adiar duas vezes joga o devocional dois dias para frente', async ({ page }) => {
    const antes = await lerAgenda(page);
    const alvo = antes.find(x => x.data >= '2026-09-24');

    // onde esse capitulo estava, na linha do tempo
    const posicaoAntes = await page.evaluate(d => D.dates.indexOf(d), alvo.data);

    for (let n = 0; n < 2; n++) {
      const atual = (await lerAgenda(page)).find(x => x.label === alvo.label);
      await page.locator(`.devo-exclude-btn[data-date="${atual.data}"]`).click();
      await page.click('#modalConfirm');
      await expect(page.locator('#modalOverlay')).toBeHidden();
    }

    const depois = await lerAgenda(page);
    const agora = depois.find(x => x.label === alvo.label);
    const posicaoDepois = await page.evaluate(d => D.dates.indexOf(d), agora.data);

    expect(posicaoDepois).toBe(posicaoAntes + 2);
  });

  test('o adiamento sobrevive ao reload e chega ao banco', async ({ page, supabase }) => {
    const alvo = await page.evaluate(() => Object.keys(devoByDate).sort().find(d => d >= '2026-09-24'));
    await page.locator(`.devo-exclude-btn[data-date="${alvo}"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#syncState')).toHaveText('sincronizado');

    expect(supabase.linha.devo_skipped).toContain(alvo);

    await page.reload();
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
    const agenda = await lerAgenda(page);
    expect(agenda.find(x => x.data === alvo)).toBeUndefined();
  });

  test('o contador de devocionais pendentes nao muda ao adiar', async ({ page }) => {
    const antes = await page.locator('#statDevoPending').textContent();
    const alvo = await page.evaluate(() => Object.keys(devoByDate).sort().find(d => d >= '2026-09-24'));
    await page.locator(`.devo-exclude-btn[data-date="${alvo}"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();
    // adiar nao e concluir: continua devendo o mesmo tanto
    await expect(page.locator('#statDevoPending')).toHaveText(antes);
  });

  test('adiar um dia ja marcado desmarca, porque ele deixou de ter devocional', async ({ page }) => {
    const alvo = await page.evaluate(() => Object.keys(devoByDate).sort().find(d => d >= '2026-09-24'));
    await page.click(`input[data-kind="devo"][data-date="${alvo}"]`);
    await expect(page.locator('#syncState')).toHaveText('sincronizado');

    await page.locator(`.devo-exclude-btn[data-date="${alvo}"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const marcado = await page.evaluate(d => devoChecked.has(d), alvo);
    expect(marcado).toBe(false);
  });

  test('o modal avisa antes e nao faz nada se cancelar', async ({ page }) => {
    const antes = await lerAgenda(page);
    const alvo = antes.find(x => x.data >= '2026-09-24');

    await page.locator(`.devo-exclude-btn[data-date="${alvo.data}"]`).click();
    await expect(page.locator('#modalText')).toContainText(alvo.label);
    await page.click('#modalCancel');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    expect(await lerAgenda(page)).toEqual(antes);
  });
});
