// Para rodar:
//   npm install
//   npm test
// Usa o Google Chrome instalado no sistema (veja `projects` abaixo).
//
// Os testes que precisam de login leem as credenciais do ambiente:
//   PLANO_EMAIL=joaovitorvv@gmail.com PLANO_PASSWORD='sua-senha' npm test
// Sem essas variaveis eles sao pulados (skip), e o restante roda normalmente.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry'
  },
  // Usa o Google Chrome ja instalado na maquina, para nao precisar baixar um
  // Chromium proprio. Se preferir o navegador do Playwright, rode
  // `npx playwright install chromium` e remova a linha do channel.
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }
  ],
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://localhost:8000/index.html',
    reuseExistingServer: true,
    timeout: 30000
  }
});
