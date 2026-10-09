// Bateria de teste do Projeto SACI (só leitura: não altera a index.html).
// Uso: ENGINE=chromium|firefox|webkit SOURCE=local|published OUT=dir node matrix.mjs
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ENGINE = process.env.ENGINE || 'chromium';
const SOURCE = process.env.SOURCE || 'local';
const OUT = process.env.OUT || 'results';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const POOL = +(process.env.POOL || 3);
// local = index.html do checkout; published = GitHub Pages; anterior = commit 2de5fb9 (no ar de 07/10 a 09/10)
const URL = SOURCE === 'published' ? 'https://2zwrmjr67t-pixel.github.io/SCI/'
  : SOURCE === 'anterior' ? (process.env.PREV_URL || 'http://127.0.0.1:8080/_anterior/index.html')
  : (process.env.LOCAL_URL || 'http://127.0.0.1:8080/index.html');

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

// Alturas "com barra do navegador visível" são estimativas (ver relatório).
const SAF_TAB = 74; // barra de status + barra do Safari no iPad
const P = [];
function phone(id, w, h, lw, lh, ua, dsf = 3) {
  P.push({ id: id + '-retrato', group: 'celular', w, h, dsf, mobile: true, touch: true, ua });
  P.push({ id: id + '-paisagem', group: 'celular', w: lw, h: lh, dsf, mobile: true, touch: true, ua });
}
phone('iphone-se', 375, 553, 667, 331, 'iphone', 2);
phone('iphone-15', 393, 659, 852, 341, 'iphone');
phone('iphone-pro-max', 430, 746, 932, 370, 'iphone');
phone('pixel-7', 412, 839, 863, 360, 'android', 2.625);
phone('galaxy-s', 360, 692, 780, 312, 'android');
function tablet(id, w, h, ua = null) {
  const sfx = ua === 'mac' ? '-uamac' : '';
  P.push({ id: id + '-retrato' + sfx, group: 'tablet', w, h: h - SAF_TAB, dsf: 2, mobile: false, touch: true, ua });
  P.push({ id: id + '-paisagem' + sfx, group: 'tablet', w: h, h: w - SAF_TAB, dsf: 2, mobile: false, touch: true, ua });
}
for (const ua of [null, 'mac']) {
  tablet('ipad-mini', 744, 1133, ua);
  tablet('ipad-air', 820, 1180, ua);
  tablet('ipad-pro-12', 1024, 1366, ua);
  if (!ua) tablet('galaxy-tab', 800, 1280, ua);
  const sfx = ua === 'mac' ? '-uamac' : '';
  for (const w of [320, 507, 678]) P.push({ id: `ipad-split-${w}${sfx}`, group: 'tablet', w, h: 1024 - SAF_TAB, dsf: 2, mobile: false, touch: true, ua });
  P.push({ id: 'ipad-slideover' + sfx, group: 'tablet', w: 320, h: 880, dsf: 2, mobile: false, touch: true, ua });
}
for (const [w, h] of [[1280, 720], [1366, 700], [1440, 860], [1920, 1080], [2560, 1440], [3840, 2160]])
  P.push({ id: `desk-${w}x${h}`, group: 'desktop', w, h, dsf: 1, mobile: false, touch: false, ua: null });
for (const [bw, bh] of [[1920, 1080], [1366, 700]])
  for (const z of [1.25, 1.5])
    P.push({ id: `desk-${bw}x${bh}-zoom${z * 100}`, group: 'desktop', w: Math.round(bw / z), h: Math.round(bh / z), dsf: z, mobile: false, touch: false, ua: null, zoom: z });

const PROFILES = ONLY ? P.filter(p => ONLY.some(o => p.id.includes(o))) : P;
const POINTS = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95];
const SHEET_SCENES = ['terr', 'competicao', 'metodologia', 'funil'];
const NO_TRANSITIONS = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}';

const engines = { chromium, firefox, webkit };

function ctxOptions(prof, motion) {
  const o = {
    viewport: { width: prof.w, height: prof.h }, deviceScaleFactor: prof.dsf,
    hasTouch: prof.touch, reducedMotion: motion, locale: 'pt-BR',
  };
  if (ENGINE !== 'firefox') o.isMobile = prof.mobile;
  if (prof.ua) o.userAgent = UA[prof.ua];
  return o;
}

async function settle(page, ms = 60) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (ms) await page.waitForTimeout(ms);
}

async function open(browser, prof, motion, opts = {}) {
  const ctx = await browser.newContext(ctxOptions(prof, motion));
  const errors = [];
  if (opts.blockFonts) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (opts.oldBrowser) await ctx.addInitScript(() => {
    try { delete Element.prototype.scrollTo; } catch (e) {}
    try { delete Window.prototype.matchMedia; delete window.matchMedia; } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push({ type: 'pageerror', msg: String(e.message || e).slice(0, 300) }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console.error', msg: m.text().slice(0, 300) }); });
  page.on('requestfailed', r => {
    if (!opts.blockFonts) errors.push({ type: 'requestfailed', msg: r.url().slice(0, 160) + ' ' + (r.failure()?.errorText || '') });
  });
  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, errors, status: resp ? resp.status() : null };
}

async function pinState(page) {
  return page.evaluate(() => ({
    cine: document.documentElement.classList.contains('cine'),
    iw: innerWidth, ih: innerHeight, cw: document.documentElement.clientWidth,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    fontsOk: document.fonts ? [...document.fonts].filter(f => f.status === 'loaded').length : null,
    pins: [...document.querySelectorAll('.pin')].map(p => ({
      id: p.id, key: p.dataset.pin, pinned: p.classList.contains('pinned'), tight: p.classList.contains('tight'),
      scale: ((p.querySelector('.stage')?.firstElementChild?.style.transform || '').match(/scale\(([\d.]+)\)/) || [])[1] || null,
    })),
  }));
}

async function scrollToScene(page, key, p) {
  return page.evaluate(([key, p]) => {
    const pin = document.querySelector(`.pin[data-pin="${key}"]`);
    const nav = document.getElementById('nav').offsetHeight || 56;
    const top = pin.getBoundingClientRect().top + scrollY;
    const total = pin.offsetHeight - (innerHeight - nav);
    const y = pin.classList.contains('pinned') ? top - nav + total * p : top - nav + Math.max(0, pin.offsetHeight - innerHeight) * p;
    window.scrollTo({ top: y, behavior: 'instant' });
    return scrollY;
  }, [key, p]);
}

// (c) textos visíveis cujo retângulo sai da .stage ou da largura da tela
async function overflowAt(page, key) {
  return page.evaluate((key) => {
    const pin = document.querySelector(`.pin[data-pin="${key}"]`);
    const stage = pin.querySelector('.stage');
    const pinned = pin.classList.contains('pinned');
    const sr = pinned ? stage.getBoundingClientRect() : null;
    const VW = document.documentElement.clientWidth;
    const out = [];
    const desc = el => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
      const par = el.parentElement; if (par && !el.id) s = (par.id ? '#' + par.id : (par.classList[0] ? '.' + par.classList[0] : par.tagName.toLowerCase())) + ' > ' + s;
      return s;
    };
    const walker = document.createTreeWalker(pin, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('title,script,style,[hidden],.sr-only,.visually-hidden')) continue;
      let op = 1, hidden = false;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
        op *= parseFloat(cs.opacity);
      }
      if (hidden || op <= 0.5) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // fora da janela vertical em cena estática não é problema (é só rolagem)
      if (!pinned && (r.bottom < 0 || r.top > innerHeight)) continue;
      const why = [];
      if (sr) {
        if (r.top < sr.top - 2) why.push('acima da cena');
        if (r.bottom > sr.bottom + 2) why.push('abaixo da cena');
        if (r.left < sr.left - 2) why.push('à esquerda da cena');
        if (r.right > sr.right + 2) why.push('à direita da cena');
      }
      if (r.left < -1) why.push('sai da tela à esquerda');
      if (r.right > VW + 1) why.push('sai da tela à direita');
      if (!why.length) continue;
      const carousel = !!el.closest('#track') && why.every(w => /direita|esquerda/.test(w));
      out.push({ el: desc(el), text: n.textContent.trim().slice(0, 50), why: why.join(', '), carousel,
        r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        stage: sr ? [Math.round(sr.left), Math.round(sr.top), Math.round(sr.right), Math.round(sr.bottom)] : null });
    }
    return out;
  }, key);
}

async function measureScenes(page, state) {
  const res = {};
  for (const pin of state.pins) {
    const items = new Map();
    const points = pin.pinned ? POINTS : [0, 0.5, 1];
    for (const p of points) {
      await scrollToScene(page, pin.key, p);
      await settle(page, 40);
      for (const o of await overflowAt(page, pin.key)) {
        const k = o.el + '|' + o.text + '|' + o.why;
        if (!items.has(k)) items.set(k, { ...o, at: [] });
        items.get(k).at.push(Math.round(p * 100) + '%');
      }
    }
    res[pin.key] = [...items.values()];
  }
  return res;
}

// (d) rolagem contínua de ponta a ponta
async function continuousScroll(page) {
  return page.evaluate(async () => {
    const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.scrollTo({ top: 0, behavior: 'instant' }); await raf();
    const step = Math.round(innerHeight * 0.35), samples = [];
    const bar = document.getElementById('prog');
    const read = () => {
      const m = (bar.style.transform || '').match(/scaleX\(([\d.]+)\)/);
      const a = document.querySelector('#navlinks a.active');
      return { y: Math.round(scrollY), prog: m ? +m[1] : null, active: a ? a.getAttribute('href') : null };
    };
    let guard = 0;
    while (guard++ < 2000) {
      samples.push(read());
      const before = scrollY;
      window.scrollBy({ top: step, behavior: 'instant' });
      await raf();
      if (Math.abs(scrollY - before) < 1) break;
    }
    await new Promise(r => setTimeout(r, 200));
    samples.push(read());
    const progs = samples.map(s => s.prog).filter(v => v != null);
    let backwards = 0; for (let i = 1; i < progs.length; i++) if (progs[i] < progs[i - 1] - 0.002) backwards++;
    const actives = [...new Set(samples.map(s => s.active).filter(Boolean))];
    const navCount = document.querySelectorAll('#navlinks a').length;
    return { steps: samples.length, progStart: progs[0], progEnd: progs[progs.length - 1], backwards, activeDistinct: actives.length, navCount, actives };
  });
}

// (e) barra do Safari recolhendo e voltando: 664 -> 760 -> 664 no meio de uma cena
async function toolbarResize(page, prof) {
  const snap = () => page.evaluate(() => {
    const pins = [...document.querySelectorAll('.pin')];
    const nav = document.getElementById('nav').offsetHeight || 56;
    const cur = pins.find(p => { const r = p.getBoundingClientRect(); return r.top <= nav + 1 && r.bottom > innerHeight * 0.5; });
    let prog = null, stageBottom = null;
    if (cur && cur.classList.contains('pinned')) {
      // mesma conta da página: usa --vh (o VH interno), não o innerHeight atual
      const vh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vh')) || innerHeight;
      const r = cur.getBoundingClientRect(), total = r.height - (vh - nav);
      prog = Math.max(0, Math.min(1, (nav - r.top) / total));
      stageBottom = Math.round(cur.querySelector('.stage').getBoundingClientRect().bottom);
    }
    const sig = ['datasN', 'tCity', 'tPol', 'agN', 'fTitle'].map(id => (document.getElementById(id) || {}).textContent).join('|')
      + '|' + document.getElementById('prog').style.transform;
    return { sig, y: Math.round(scrollY), ih: innerHeight, scene: cur ? cur.dataset.pin : null, prog, stageBottom,
      vhVar: getComputedStyle(document.documentElement).getPropertyValue('--vh').trim(),
      pinned: pins.filter(p => p.classList.contains('pinned')).length };
  });
  await page.setViewportSize({ width: prof.w, height: 664 }); await page.waitForTimeout(400);
  const st = await pinState(page);
  const target = ['competicao', 'terr', 'metodologia', 'funil', 'fases', 'rede'].find(k => st.pins.find(p => p.key === k && p.pinned)) || 'competicao';
  await scrollToScene(page, target, 0.5); await settle(page, 200);
  const a = await snap();
  await page.setViewportSize({ width: prof.w, height: 760 }); await page.waitForTimeout(400); await settle(page);
  const b = await snap();
  await page.setViewportSize({ width: prof.w, height: 664 }); await page.waitForTimeout(400); await settle(page);
  const c = await snap();
  const jump = (x, y) => (x.prog != null && y.prog != null) ? Math.abs(x.prog - y.prog) : null;
  return { target, a, b, c, sigChangedAB: a.sig !== b.sig, sigRestoredAC: a.sig === c.sig, jumpAB: jump(a, b), jumpAC: jump(a, c), dyAC: Math.abs(a.y - c.y),
    gapAt760: b.stageBottom != null ? b.ih - b.stageBottom : null };
}

async function sheetShots(page, state) {
  const shots = [];
  for (const k of SHEET_SCENES) {
    const pin = state.pins.find(p => p.key === k);
    await scrollToScene(page, k, pin && pin.pinned ? 0.6 : 0);
    await settle(page, 250);
    shots.push({ k, pinned: !!(pin && pin.pinned), buf: await page.screenshot({ scale: 'css', type: 'png' }) });
  }
  return shots;
}

async function composeSheet(browser, prof, shots, file) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const names = { terr: 'Território', competicao: 'Competição', metodologia: 'Metodologia', funil: 'Funil' };
  const H = 420;
  const cells = shots.map(s => `<figure><img src="data:image/png;base64,${s.buf.toString('base64')}" style="height:${H}px"><figcaption>${names[s.k]} · ${s.pinned ? 'animada (60%)' : 'ESTÁTICA'}</figcaption></figure>`).join('');
  await page.setContent(`<html><body style="margin:0;background:#222;color:#eee;font:14px system-ui;padding:12px;display:inline-block">
    <div style="margin:0 0 8px;font-weight:600">${prof.id} · ${prof.w}×${prof.h}${prof.zoom ? ' (zoom ' + prof.zoom * 100 + '%)' : ''} · ${ENGINE} · ${SOURCE}</div>
    <div style="display:flex;gap:10px;align-items:flex-start">${cells}</div>
    <style>figure{margin:0}img{display:block;border:1px solid #555;width:auto;max-width:${Math.round(H * 2.2)}px;object-fit:contain}figcaption{margin-top:4px}</style></body></html>`);
  await page.waitForTimeout(100);
  const el = await page.$('body');
  await el.screenshot({ path: file });
  await ctx.close();
}

async function runProfile(browser, prof) {
  const r = { profile: prof, engine: ENGINE, source: SOURCE, modes: {} };
  for (const motion of ['reduce', 'no-preference']) {
    const t0 = Date.now();
    let s;
    try {
      s = await open(browser, prof, motion);
      const state = await pinState(s.page);
      const m = { status: s.status, state, scenes: null, scroll: null, resize: null };
      let shots = null;
      if (motion === 'no-preference') shots = await sheetShots(s.page, state);
      await s.page.addStyleTag({ content: NO_TRANSITIONS });
      m.scenes = await measureScenes(s.page, state);
      m.scroll = await continuousScroll(s.page);
      m.resize = await toolbarResize(s.page, prof);
      m.errors = s.errors;
      m.ms = Date.now() - t0;
      r.modes[motion] = m;
      if (shots) {
        const dir = path.join(OUT, 'sheets');
        fs.mkdirSync(dir, { recursive: true });
        await composeSheet(browser, prof, shots, path.join(dir, `${prof.id}.png`));
      }
    } catch (e) {
      r.modes[motion] = { fatal: String(e.message || e).slice(0, 400), errors: s ? s.errors : [] };
    } finally { if (s) await s.ctx.close().catch(() => {}); }
  }
  // (f) fontes externas bloqueadas
  let s;
  try {
    s = await open(browser, prof, 'no-preference', { blockFonts: true });
    const state = await pinState(s.page);
    await s.page.addStyleTag({ content: NO_TRANSITIONS });
    r.fontsBlocked = { state, scenes: await measureScenes(s.page, state), errors: s.errors };
  } catch (e) { r.fontsBlocked = { fatal: String(e.message || e).slice(0, 400) }; }
  finally { if (s) await s.ctx.close().catch(() => {}); }
  // (g) navegador antigo: sem Element.prototype.scrollTo e sem window.matchMedia
  s = null;
  try {
    s = await open(browser, prof, 'no-preference', { oldBrowser: true });
    const state = await pinState(s.page);
    const scroll = await continuousScroll(s.page);
    // clique numa aba de fase (usa window.scrollTo + rm.matches)
    let tabClick = null;
    try {
      await s.page.evaluate(() => document.getElementById('fases').scrollIntoView());
      await settle(s.page, 100);
      await s.page.evaluate(() => document.querySelector('.tab[data-phase="3"]').click());
      await s.page.waitForTimeout(800);
      tabClick = await s.page.evaluate(() => document.getElementById('fTitle').textContent);
    } catch (e) { tabClick = 'ERRO: ' + e.message.slice(0, 120); }
    r.oldBrowser = { state, scroll, tabClick, errors: s.errors };
  } catch (e) { r.oldBrowser = { fatal: String(e.message || e).slice(0, 400) }; }
  finally { if (s) await s.ctx.close().catch(() => {}); }
  return r;
}

const browser = await engines[ENGINE].launch();
const version = browser.version();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let idx = 0;
async function worker() {
  while (idx < PROFILES.length) {
    const prof = PROFILES[idx++];
    const t = Date.now();
    const r = await runProfile(browser, prof);
    results.push(r);
    const e = Object.values(r.modes).reduce((n, m) => n + (m.errors ? m.errors.length : 0), 0);
    console.log(`[${ENGINE}/${SOURCE}] ${prof.id} ${((Date.now() - t) / 1000).toFixed(1)}s erros=${e}`);
  }
}
await Promise.all(Array.from({ length: POOL }, worker));
await browser.close();
results.sort((a, b) => P.indexOf(a.profile) - P.indexOf(b.profile));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ engine: ENGINE, version, source: SOURCE, url: URL, results }, null, 1));
console.log('ok', results.length);
