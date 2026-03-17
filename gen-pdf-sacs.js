const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const filePath = path.join(__dirname, 'inventaire-sac.html');
  await page.goto('file:///' + filePath.replace(/\\/g, '/'));
  await page.waitForTimeout(1000);

  const sacs = [
    { nom: 'Sac Manoeuvre #1', file: 'Sac Manoeuvre #1 — BLEU' },
    { nom: 'Sac Manoeuvre #2', file: 'Sac Manoeuvre #2 — VERT' },
    { nom: 'Kit Sauveteur #1', file: 'Kit Sauveteur #1 — ROUGE' },
    { nom: 'Kit Sauveteur #2', file: 'Kit Sauveteur #2 — JAUNE' },
    { nom: 'Premier de cordée', file: 'Premier de cordée — GOLD' },
    { nom: 'Kit Montée en Tête', file: 'Kit Montée en Tête — GOLD' },
  ];

  const outDir = path.join(__dirname, '..', '..', 'PDF SAC');

  for (const sac of sacs) {
    // Back to selector
    await page.goto('file:///' + filePath.replace(/\\/g, '/'));
    await page.waitForTimeout(500);

    // Click the button matching this sac
    const buttons = await page.$$('.btn');
    let clicked = false;
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text.includes(sac.nom)) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log('SKIP: ' + sac.nom + ' — button not found');
      continue;
    }

    await page.waitForTimeout(500);

    // Generate PDF — single A4 page
    const pdfPath = path.join(outDir, sac.file + '.pdf');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '3mm', bottom: '3mm', left: '5mm', right: '5mm' },
    });
    console.log('OK: ' + pdfPath);
  }

  await browser.close();
  console.log('DONE — all PDFs generated');
})();
