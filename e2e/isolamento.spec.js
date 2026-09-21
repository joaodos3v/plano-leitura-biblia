// Trava de seguranca. Ja aconteceu de a suite escrever no Supabase de
// producao e apagar os capitulos de um dia do plano real. Estes testes
// garantem que o app so conversa com o falso.

const { test, expect } = require('./fixtures');
const { openLoggedIn } = require('./helpers');

test.describe('isolamento da producao', () => {
  test('toda chamada ao Supabase e atendida pelo falso', async ({ page, supabase }) => {
    await openLoggedIn(page);
    // o login e a carga inicial passaram pelo mock
    expect(supabase.chamadas).toContain('POST /auth/v1/token');
    expect(supabase.chamadas.some(c => c.includes('/rest/v1/bible_progress'))).toBe(true);
  });

  test('o que o app grava vai para o banco em memoria, nao para a nuvem', async ({ page, supabase }) => {
    await openLoggedIn(page);
    expect(supabase.linha).not.toBeNull();

    const alvo = await page.evaluate(
      () => D.dates.find(d => !planChecked.has(d) && (planAssignment[d] || []).length)
    );
    await page.click(`input[data-kind="plan"][data-date="${alvo}"]`);
    await expect(page.locator('#syncState')).toHaveText('sincronizado');

    // a gravacao chegou ao falso, com o dia marcado
    expect(supabase.chamadas).toContain('PATCH /rest/v1/bible_progress');
    expect(supabase.linha.plan_checked).toContain(alvo);
  });

  test('nenhuma rota inesperada foi pedida ao Supabase', async ({ page, supabase }) => {
    await openLoggedIn(page);
    const previstas = ['/auth/v1/token', '/auth/v1/user', '/auth/v1/logout', '/rest/v1/bible_progress'];
    const inesperadas = supabase.chamadas.filter(
      c => !previstas.some(p => c.endsWith(p))
    );
    expect(inesperadas).toEqual([]);
  });
});
