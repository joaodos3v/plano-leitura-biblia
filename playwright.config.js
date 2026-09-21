// Para rodar:
//   npm install
//   npm test
//
// A suite NUNCA fala com o Supabase de producao: e2e/fixtures.js instala um
// Supabase falso (e2e/fake-supabase.js) em toda page automaticamente, e toda
// chamada ao dominio do projeto e atendida em memoria. Nao existe variavel de
// ambiente que ligue a producao -- se precisar de outro backend, aponte o
// falso para ele.
//
// Usa o Google Chrome instalado no sistema (veja `projects` abaixo).

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    // O service worker guardaria respostas entre os testes e atrapalharia o
    // Supabase falso. A PWA e verificada a parte, em pwa.spec.js.
    serviceWorkers: 'block'
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
