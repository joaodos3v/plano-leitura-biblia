// "Estou lendo": registra ate onde voce chegou sem fechar o dia, para poder
// voltar e ler o resto mais tarde.

const { test, expect } = require('./fixtures');
const { openLoggedIn } = require('./helpers');

const diaAberto = (page) => page.evaluate(
  () => D.dates.find(d => d >= todayISO() && !planChecked.has(d) && (planAssignment[d] || []).length > 1)
);

async function marcarLendo(page, dt, ate) {
  await page.locator(`.partial-btn[data-date="${dt}"]`).click();
  await page.locator(`.menu-item[data-date="${dt}"][data-modo="lendo"]`).click();
  await page.locator(`.chip[data-date="${dt}"][data-lidos="${ate}"]`).click();
}

test.describe('estou lendo', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('o menu oferece as tres opcoes', async ({ page }) => {
    const dt = await diaAberto(page);
    await page.locator(`.partial-btn[data-date="${dt}"]`).click();
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="lendo"]`)).toHaveText('Estou lendo');
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="parte"]`)).toHaveText('Li parte');
    await expect(page.locator(`.menu-item[data-date="${dt}"][data-modo="mais"]`)).toHaveText('Li mais');
  });

  test('nao pede confirmacao, porque nao redistribui nada', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 2);
    await expect(page.locator('#modalOverlay')).toBeHidden();
  });

  test('mantem o dia aberto e a distribuicao intacta', async ({ page }) => {
    const dt = await diaAberto(page);
    const antes = await page.evaluate(() => JSON.stringify(planAssignment));

    await marcarLendo(page, dt, 2);

    const r = await page.evaluate(d => ({
      marcado: planChecked.has(d),
      parcial: partialRead[d],
      noDia: planAssignment[d].length,
      assignment: JSON.stringify(planAssignment)
    }), dt);

    expect(r.marcado).toBe(false);        // o dia continua aberto
    expect(r.parcial).toBe(2);
    expect(r.assignment).toBe(antes);     // nada foi redistribuido
    await expect(page.locator(`input[data-kind="plan"][data-date="${dt}"]`)).not.toBeChecked();
  });

  test('os capitulos lidos contam no total de lidos', async ({ page }) => {
    const dt = await diaAberto(page);
    const lidosAntes = Number(await page.locator('#statRead').textContent());
    await marcarLendo(page, dt, 2);
    await expect(page.locator('#statRead')).toHaveText(String(lidosAntes + 2));
  });

  test('o card mostra o que ja foi lido e o que falta', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 2);
    const nota = page.locator(`.partial-note[data-date="${dt}"]`);
    await expect(nota).toBeVisible();
    await expect(nota).toContainText('Lendo:');
    await expect(nota).toContainText('faltam');
  });

  test('da para avancar o marcador mais tarde', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 2);
    await marcarLendo(page, dt, 4);
    const r = await page.evaluate(d => ({ parcial: partialRead[d], marcado: planChecked.has(d) }), dt);
    expect(r.parcial).toBe(4);
    expect(r.marcado).toBe(false);
  });

  test('marcar ate o ultimo capitulo fecha o dia', async ({ page }) => {
    const dt = await diaAberto(page);
    const total = await page.evaluate(d => planAssignment[d].length, dt);
    // a faixa nao oferece o ultimo capitulo, entao chegamos nele pelo checkbox
    await marcarLendo(page, dt, total - 1);
    await page.click(`input[data-kind="plan"][data-date="${dt}"]`);
    const r = await page.evaluate(d => ({ marcado: planChecked.has(d), noDia: planAssignment[d].length }), dt);
    expect(r.marcado).toBe(true);
    expect(r.noDia).toBe(total);          // o dia inteiro conta
  });

  test('"Li parte" depois disso fecha o dia e redistribui', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 2);

    await page.locator(`.partial-btn[data-date="${dt}"]`).click();
    await page.locator(`.menu-item[data-date="${dt}"][data-modo="parte"]`).click();
    await page.locator(`.chip[data-date="${dt}"][data-lidos="2"]`).click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const r = await page.evaluate(d => ({
      marcado: planChecked.has(d), noDia: planAssignment[d].length, parcial: partialRead[d]
    }), dt);
    expect(r.marcado).toBe(true);
    expect(r.noDia).toBe(2);
    expect(r.parcial).toBeUndefined();    // a marca de leitura em curso saiu
  });

  test('o Excluir avisa que a leitura registrada sera descartada', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 2);
    await page.locator(`.exclude-btn[data-date="${dt}"]`).click();
    await expect(page.locator('#modalText')).toContainText('sera descartada');
  });

  test('chega ao banco e sobrevive ao reload', async ({ page, supabase }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 3);
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
    expect(supabase.linha.partial_read[dt]).toBe(3);

    await page.reload();
    await expect(page.locator('#syncState')).toHaveText('sincronizado');
    expect(await page.evaluate(d => partialRead[d], dt)).toBe(3);
    await expect(page.locator(`.partial-note[data-date="${dt}"]`)).toBeVisible();
  });
});

// A leitura ja registrada nao pode mudar de lugar quando o plano e refeito:
// aqueles capitulos foram lidos de verdade.
test.describe('estou lendo + redistribuicao', () => {
  test.beforeEach(async ({ page }) => {
    await openLoggedIn(page);
  });

  test('trocar de modo preserva os capitulos ja lidos no dia', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 3);
    const lidosAntes = await page.evaluate(
      d => planAssignment[d].slice(0, partialRead[d]).map(c => c.join(' ')), dt);
    const totalLidosAntes = await page.locator('#statRead').textContent();

    await page.locator('#modeRitmo').click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

    const depois = await page.evaluate(
      d => ({
        lidos: planAssignment[d].slice(0, partialRead[d]).map(c => c.join(' ')),
        parcial: partialRead[d]
      }), dt);

    expect(depois.parcial).toBe(3);
    expect(depois.lidos).toEqual(lidosAntes);           // os mesmos capitulos
    await expect(page.locator('#statRead')).toHaveText(totalLidosAntes);
  });

  test('a ordem canonica sobrevive a fixacao', async ({ page }) => {
    const dt = await diaAberto(page);
    await marcarLendo(page, dt, 3);
    await page.locator('#modeRitmo').click();
    await page.click('#modalConfirm');
    await expect(page.locator('#modalOverlay')).toBeHidden();

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
