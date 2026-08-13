const { chromium } = require("playwright");

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Im1hc3RlcmRvY200YTFAaG90bWFpbC5jb20iLCJyb2xlIjoib3duZXIiLCJwZXJtaXNzaW9ucyI6WyJkYXNoYm9hcmQuYWNjZXNzIiwic3RvcmUuY3VzdG9taXplIiwicHJvZHVjdHMucmVhZCIsInByb2R1Y3RzLndyaXRlIiwib3JkZXJzLnJlYWQiLCJvcmRlcnMubWFuYWdlIiwidXNlcnMubWFuYWdlIiwidGVhbS5tYW5hZ2UiLCJjaGF0LmFjY2VzcyJdLCJpYXQiOjE3ODY1NTgzNTEsImV4cCI6MTc4NjU2MDE1MX0.QiqF7H5FCUbTJv7j3Lek66F0RTkEXg9-3UMxDgpgSZc";

const widths = [390, 600, 700, 820, 900, 1024, 1280];

async function checkOverflow(page) {
  return page.evaluate(() => {
    const all = document.querySelectorAll("body *");
    const offenders = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 2 || r.left < -2) {
        offenders.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 50), right: Math.round(r.right), left: Math.round(r.left) });
        if (offenders.length >= 8) break;
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "auth_token", value: TOKEN, domain: "localhost", path: "/" }]);
    const page = await context.newPage();
    try {
      await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(800);
      const overflow = await checkOverflow(page);
      const overflowing = overflow.scrollWidth > overflow.clientWidth + 2;
      console.log(`dashboard @ ${width}px:`, overflowing ? "OVERFLOW " + JSON.stringify(overflow) : "ok");
      await page.screenshot({ path: `_audit-dashboard-${width}.png`, fullPage: false });
    } catch (e) {
      console.log(`dashboard @ ${width}px: ERROR`, e.message);
    }
    await context.close();
  }
  await browser.close();
})();
