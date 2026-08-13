const { chromium } = require("playwright");

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Im1hc3RlcmRvY200YTFAaG90bWFpbC5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzg2NTU4MjU0LCJleHAiOjE3ODY1NjAwNTR9.zVd-eqlTpG4KsQKNFcxquNOG8GiUx13e1qMFiZpw3F0";

const pages = [
  { name: "home", url: "http://localhost:3000/" },
  { name: "catalog", url: "http://localhost:3000/catalog" },
  { name: "product", url: "http://localhost:3000/product/loc-sock-black-satin-lined" },
];

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
      bodyScrollWidth: document.body.scrollWidth,
      offenders,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const p of pages) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: "auth_token", value: TOKEN, domain: "localhost", path: "/" }]);
      const page = await context.newPage();
      try {
        await page.goto(p.url, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(500);
        const overflow = await checkOverflow(page);
        const overflowing = overflow.scrollWidth > overflow.clientWidth + 2;
        console.log(`${p.name} @ ${width}px:`, overflowing ? "OVERFLOW " + JSON.stringify(overflow) : "ok");
        if (overflowing) {
          await page.screenshot({ path: `_audit-${p.name}-${width}.png`, fullPage: false });
        }
      } catch (e) {
        console.log(`${p.name} @ ${width}px: ERROR`, e.message);
      }
      await context.close();
    }
  }
  await browser.close();
})();
