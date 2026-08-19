#!/usr/bin/env node
// ============================================================================
// cdp.mjs — driver único para operar um Chrome via CDP.
//
// DOIS MODOS, uma ferramenta:
//   • DOM        (fill/click/attr/exists/waitfor) — para aplicações web. DEFAULT.
//   • COORDENADA (xclick/scroll/type/key)         — para desktop remoto dentro
//                                                   de um <canvas> (sessão PAM/RDP).
//
// DOIS TRANSPORTES, escolhidos sozinhos:
//   • CDP CRU (WebSocket direto na ABA) para captura/input/eval. Imune ao
//     travamento de handshake que o connectOverCDP sofre quando o Chrome expõe
//     alvos de UI interna (omnibox popup).
//   • Playwright (opcional) só para seletores ricos (:has-text, auto-wait).
//     Sem playwright-core instalado, cai num fallback querySelector com aviso.
//
// GOVERNANÇA: toda ação que muda estado grava em journal.jsonl e devolve um
// screenshot numerado em shots/. Nunca agir às cegas.
//
// Uso:
//   node cdp.mjs tabs | frames | url | info
//   node cdp.mjs shot [--out f.png]
//   node cdp.mjs html [--out f.html] [--frame nome]
//   node cdp.mjs goto <url>
//   node cdp.mjs fill <sel> <valor>        [--frame nome]
//   node cdp.mjs click <sel>               [--frame nome]
//   node cdp.mjs attr <sel> <atributo>     [--frame nome]
//   node cdp.mjs exists <sel> | waitfor <sel> [ms]
//   node cdp.mjs type "<texto>" | press <Enter> | key <Alt+F>
//   node cdp.mjs xclick <x> <y> [--double|--right] | scroll <x> <y> <dy>
//   node cdp.mjs eval "<js>"
//   node cdp.mjs download <sel> [--dir <pasta>] [--timeout ms]
//
// Env: CHROME_CDP (default http://127.0.0.1:9222), TAB_MATCH (regex de aba),
//      CDP_RAW=1 (proíbe Playwright), CDP_TIMEOUT (ms do handshake).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = process.env.CDP_OUTDIR || path.join(process.cwd(), '.cdp');
const SHOTS = path.join(OUTDIR, 'shots');
const JOURNAL = path.join(OUTDIR, 'journal.jsonl');
fs.mkdirSync(SHOTS, { recursive: true });

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = { double: false, right: false };
const pos = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') flags.out = argv[++i];
  else if (a === '--frame') flags.frame = argv[++i];
  else if (a === '--tab') flags.tab = argv[++i];
  else if (a === '--dir') flags.dir = argv[++i];
  else if (a === '--timeout') flags.timeout = Number(argv[++i]);
  else if (a === '--double') flags.double = true;
  else if (a === '--right') flags.right = true;
  else pos.push(a);
}
const CDP_BASE = (process.env.CHROME_CDP || 'http://127.0.0.1:9222').replace(/\/$/, '');
const TAB_RE = new RegExp(flags.tab || process.env.TAB_MATCH || '.', 'i');
const HANDSHAKE_MS = Number(process.env.CDP_TIMEOUT || 15000);

const journal = (e) => fs.appendFileSync(JOURNAL, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n');
const nextShot = () => path.join(SHOTS, String(fs.readdirSync(SHOTS).filter(f => f.endsWith('.png')).length).padStart(3, '0') + '.png');
const die = (msg, code = 2) => { console.error('ERRO: ' + msg); process.exit(code); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- alvo (aba) -------------------------------------------------------------
async function listTargets() {
  try {
    return await fetch(CDP_BASE + '/json').then(r => r.json());
  } catch (e) {
    die(`CDP mudo em ${CDP_BASE}. O Chrome subiu com --remote-debugging-port? (rode chrome-up.sh)\n  ${String(e.message).split('\n')[0]}`);
  }
}
async function pickTarget(targets) {
  const pages = targets.filter(t => t.type === 'page' && !String(t.url).startsWith('devtools://'));
  if (!pages.length) die('nenhuma aba aberta no Chrome de automação.');
  return pages.find(t => TAB_RE.test(t.url || '') || TAB_RE.test(t.title || '')) || pages[0];
}

// ---- cliente CDP cru --------------------------------------------------------
async function rawClient(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('TIMEOUT abrindo ws da aba — a janela do Chrome está MINIMIZADA? (cobrir pode, minimizar não)')), HANDSHAKE_MS);
    ws.addEventListener('open', () => { clearTimeout(t); res(); });
    ws.addEventListener('error', () => { clearTimeout(t); rej(new Error('ws error em ' + target.webSocketDebuggerUrl)); });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const t = setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('TIMEOUT ' + method)); } }, 30000);
    pending.set(i, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  const shot = async (out) => {
    const dest = out || nextShot();
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    return dest;
  };
  return { ws, send, evalJs, shot, close: () => ws.close() };
}

// ---- teclado (mapa de teclas nomeadas + acordes) ----------------------------
const MOD = { alt: 1, ctrl: 2, control: 2, meta: 4, shift: 8 };
const NAMED = {
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' }, return: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', vk: 9, text: '\t' },
  escape: { key: 'Escape', code: 'Escape', vk: 27 }, esc: { key: 'Escape', code: 'Escape', vk: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 }, delete: { key: 'Delete', code: 'Delete', vk: 46 },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 }, down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 }, right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  home: { key: 'Home', code: 'Home', vk: 36 }, end: { key: 'End', code: 'End', vk: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', vk: 33 }, pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
};
for (let i = 1; i <= 12; i++) NAMED['f' + i] = { key: 'F' + i, code: 'F' + i, vk: 111 + i };
const MODKEY = { alt: { key: 'Alt', code: 'AltLeft', vk: 18 }, ctrl: { key: 'Control', code: 'ControlLeft', vk: 17 }, control: { key: 'Control', code: 'ControlLeft', vk: 17 }, shift: { key: 'Shift', code: 'ShiftLeft', vk: 16 }, meta: { key: 'Meta', code: 'MetaLeft', vk: 91 } };
const charInfo = (ch) => {
  if (/[a-z]/.test(ch)) return { key: ch, code: 'Key' + ch.toUpperCase(), vk: ch.toUpperCase().charCodeAt(0), shift: false };
  if (/[A-Z]/.test(ch)) return { key: ch, code: 'Key' + ch, vk: ch.charCodeAt(0), shift: true };
  if (/[0-9]/.test(ch)) return { key: ch, code: 'Digit' + ch, vk: ch.charCodeAt(0), shift: false };
  if (ch === ' ') return { key: ' ', code: 'Space', vk: 32, shift: false };
  return { key: ch, code: '', vk: 0, shift: false };
};

// ---- Playwright opcional (só para seletor rico) ------------------------------
async function playwrightPage() {
  if (process.env.CDP_RAW === '1') return null;
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { return null; }
  try {
    const browser = await chromium.connectOverCDP(CDP_BASE, { timeout: HANDSHAKE_MS });
    const pages = browser.contexts().flatMap(c => c.pages());
    const page = pages.find(p => TAB_RE.test(p.url())) || pages.find(p => !p.url().startsWith('devtools://')) || pages[0];
    if (!page) { await browser.close().catch(() => {}); return null; }
    const ctx = flags.frame
      ? (page.frames().find(f => f.name() === flags.frame || f.url().includes(flags.frame)) || page)
      : page;
    if (flags.frame && ctx === page) console.error(`AVISO: frame "${flags.frame}" não encontrado; usando a página principal.`);
    return { browser, page, ctx };
  } catch (e) {
    console.error('AVISO: connectOverCDP falhou (' + String(e.message).split('\n')[0] + '); caindo no fallback querySelector.');
    return null;
  }
}

// fallback sem Playwright: querySelector puro. Não suporta :has-text() nem
// auto-wait, e um .click() em <span> pode não disparar onclick — por isso avisa.
const jsSel = (sel) => JSON.stringify(sel);
const rawDom = {
  click: (sel) => `(()=>{const e=document.querySelector(${jsSel(sel)}); if(!e) return 'NOTFOUND'; e.scrollIntoView({block:'center'}); e.click(); return 'OK';})()`,
  fill: (sel, v) => `(()=>{const e=document.querySelector(${jsSel(sel)}); if(!e) return 'NOTFOUND'; e.focus(); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 'OK';})()`,
  attr: (sel, a) => `(()=>{const e=document.querySelector(${jsSel(sel)}); return e?String(e.getAttribute(${jsSel(a)})):'NOTFOUND';})()`,
  count: (sel) => `document.querySelectorAll(${jsSel(sel)}).length`,
};

// ---- main -------------------------------------------------------------------
const targets = await listTargets();

if (cmd === 'tabs') {
  for (const t of targets.filter(t => t.type === 'page')) {
    console.log(String(t.title || '').slice(0, 55).padEnd(55), '|', String(t.url).slice(0, 110));
  }
  process.exit(0);
}

const target = await pickTarget(targets);
const raw = await rawClient(target);

try {
  switch (cmd) {
    case 'url':
      console.log(target.url);
      break;

    case 'info': {
      const o = JSON.parse(await raw.evalJs('JSON.stringify({css:[innerWidth,innerHeight],dpr:devicePixelRatio})'));
      console.log(JSON.stringify({ ...o, device: [Math.round(o.css[0] * o.dpr), Math.round(o.css[1] * o.dpr)], tab: target.title, url: target.url }, null, 2));
      break;
    }

    case 'frames': {
      const { frameTree } = await raw.send('Page.getFrameTree');
      const walk = (n, d = 0) => {
        console.log('  '.repeat(d) + (n.frame.name ? JSON.stringify(n.frame.name) : '(sem nome)') + ' | ' + String(n.frame.url).slice(0, 100));
        (n.childFrames || []).forEach(c => walk(c, d + 1));
      };
      walk(frameTree);
      break;
    }

    case 'shot': {
      const out = await raw.shot(flags.out);
      journal({ a: 'shot', out });
      console.log('SHOT', out);
      break;
    }

    case 'goto': {
      if (!pos[0]) die('uso: goto <url>');
      await raw.send('Page.navigate', { url: pos[0] });
      await sleep(1500);
      journal({ a: 'goto', url: pos[0] });
      console.log('OK', pos[0]);
      break;
    }

    case 'html': {
      const pw = flags.frame ? await playwrightPage() : null;
      const html = pw ? await pw.ctx.content() : await raw.evalJs('document.documentElement.outerHTML');
      if (pw) await pw.browser.close().catch(() => {});
      const out = flags.out || path.join(OUTDIR, 'page.html');
      fs.writeFileSync(out, html || '');
      console.log('HTML', out, (html || '').length, 'chars');
      break;
    }

    case 'eval': {
      if (!pos[0]) die('uso: eval "<js>"');
      const r = await raw.evalJs(pos[0]);
      console.log(typeof r === 'string' ? r : JSON.stringify(r));
      break;
    }

    // ---- DOM ---------------------------------------------------------------
    case 'fill': case 'click': case 'attr': case 'exists': case 'waitfor': case 'download': {
      if (!pos[0]) die(`uso: ${cmd} <seletor> ...`);
      const pw = await playwrightPage();
      const sel = pos[0];

      if (cmd === 'download') {
        const dir = flags.dir || path.join(OUTDIR, 'downloads');
        fs.mkdirSync(dir, { recursive: true });
        const antes = new Set(fs.readdirSync(dir));
        // O saveAs do Playwright CANCELA em modo connectOverCDP -> setDownloadBehavior + polling.
        await raw.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }).catch(async () =>
          raw.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }));
        if (pw) await pw.ctx.click(sel, { timeout: 15000 });
        else if (await raw.evalJs(rawDom.click(sel)) === 'NOTFOUND') die('seletor não encontrado: ' + sel);
        const limite = Date.now() + (flags.timeout || 120000);
        let achado = null, tamAnterior = -1, estavel = 0;
        while (Date.now() < limite) {
          await sleep(1000);
          const novos = fs.readdirSync(dir).filter(f => !antes.has(f) && !f.endsWith('.crdownload'));
          if (novos.length) {
            achado = path.join(dir, novos[0]);
            const t = fs.statSync(achado).size;
            // só entrega quando o tamanho para de crescer: .crdownload de 0 byte não é entrega
            if (t > 0 && t === tamAnterior) { estavel++; if (estavel >= 2) break; } else estavel = 0;
            tamAnterior = t;
          }
        }
        if (!achado) die('nenhum arquivo novo em ' + dir + ' dentro do timeout.');
        journal({ a: 'download', sel, file: achado, bytes: fs.statSync(achado).size });
        console.log('DOWNLOAD', achado, fs.statSync(achado).size, 'bytes');
        if (pw) await pw.browser.close().catch(() => {});
        break;
      }

      if (!pw && /:has-text|>>|text=/.test(sel)) {
        die('seletor rico (' + sel + ') exige playwright-core. Instale (npm i playwright-core) ou use um seletor CSS puro.');
      }

      if (pw) {
        try {
          switch (cmd) {
            case 'fill': await pw.ctx.fill(sel, pos[1] ?? '', { timeout: 15000 }); console.log('FILL', sel); journal({ a: 'fill', sel, frame: flags.frame }); break;
            case 'click': await pw.ctx.click(sel, { timeout: 15000 }); console.log('CLICK', sel); journal({ a: 'click', sel, frame: flags.frame }); break;
            case 'attr': console.log(JSON.stringify(await pw.ctx.getAttribute(sel, pos[1], { timeout: 15000 }))); break;
            case 'exists': { const n = await pw.ctx.locator(sel).count(); console.log(n > 0 ? 'YES ' + n : 'NO'); break; }
            case 'waitfor': await pw.ctx.waitForSelector(sel, { timeout: Number(pos[1] || 20000) }); console.log('APPEARED', sel); break;
          }
        } finally { await pw.browser.close().catch(() => {}); }
      } else {
        switch (cmd) {
          case 'fill': { const r = await raw.evalJs(rawDom.fill(sel, pos[1] ?? '')); r === 'OK' ? console.log('FILL', sel) : die('seletor não encontrado: ' + sel); journal({ a: 'fill', sel, via: 'raw' }); break; }
          case 'click': { const r = await raw.evalJs(rawDom.click(sel)); r === 'OK' ? console.log('CLICK', sel, '(via JS .click() — se o handler não disparar, instale playwright-core)') : die('seletor não encontrado: ' + sel); journal({ a: 'click', sel, via: 'raw' }); break; }
          case 'attr': console.log(JSON.stringify(await raw.evalJs(rawDom.attr(sel, pos[1])))); break;
          case 'exists': { const n = await raw.evalJs(rawDom.count(sel)); console.log(n > 0 ? 'YES ' + n : 'NO'); break; }
          case 'waitfor': {
            const limite = Date.now() + Number(pos[1] || 20000);
            while (Date.now() < limite) { if (await raw.evalJs(rawDom.count(sel)) > 0) { console.log('APPEARED', sel); process.exit(0); } await sleep(400); }
            die('não apareceu em ' + (pos[1] || 20000) + 'ms: ' + sel);
          }
        }
      }
      if (['fill', 'click'].includes(cmd)) console.log('SHOT', await raw.shot());
      break;
    }

    // ---- coordenada / teclado ----------------------------------------------
    case 'xclick': {
      const [x, y] = pos.map(Number);
      if (Number.isNaN(x) || Number.isNaN(y)) die('uso: xclick <x> <y>');
      const dpr = await raw.evalJs('devicePixelRatio');
      // screenshot vem em px de DISPOSITIVO, o clique usa px CSS. Converte aqui:
      // passe SEMPRE a coordenada lida no screenshot.
      const cx = Math.round(x / dpr), cy = Math.round(y / dpr);
      const button = flags.right ? 'right' : 'left';
      await raw.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, buttons: 0 });
      await sleep(60);
      for (let c = 1; c <= (flags.double ? 2 : 1); c++) {
        await raw.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button, buttons: flags.right ? 2 : 1, clickCount: c });
        await raw.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button, buttons: flags.right ? 2 : 1, clickCount: c });
      }
      await sleep(400);
      journal({ a: 'xclick', shot_xy: [x, y], css_xy: [cx, cy], dpr, double: flags.double, right: flags.right });
      console.log(`xclick shot(${x},${y}) -> css(${cx},${cy}) dpr=${dpr} -> ${await raw.shot()}`);
      break;
    }

    case 'scroll': {
      const [x, y, dy] = pos.map(Number);
      const dpr = await raw.evalJs('devicePixelRatio');
      await raw.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x / dpr), y: Math.round(y / dpr), deltaX: 0, deltaY: dy });
      await sleep(300);
      journal({ a: 'scroll', shot_xy: [x, y], dy });
      console.log('SHOT', await raw.shot());
      break;
    }

    case 'type': {
      const text = pos.join(' ');
      const kev = (type, o) => raw.send('Input.dispatchKeyEvent', { type, modifiers: o.modifiers || 0, key: o.key, code: o.code || '', windowsVirtualKeyCode: o.vk || 0, nativeVirtualKeyCode: o.vk || 0, ...(o.text ? { text: o.text, unmodifiedText: o.text } : {}) });
      for (const ch of text) {
        const ci = charInfo(ch);
        const mods = ci.shift ? MOD.shift : 0;
        await kev('keyDown', { ...ci, modifiers: mods, text: ch });
        await kev('keyUp', { ...ci, modifiers: mods });
        await sleep(30);
      }
      await sleep(200);
      journal({ a: 'type', len: text.length });
      console.log('SHOT', await raw.shot());
      break;
    }

    case 'press': case 'key': {
      if (!pos[0]) die('uso: key <Enter|Alt+F|Ctrl+C|...>');
      const kev = (type, o) => raw.send('Input.dispatchKeyEvent', { type, modifiers: o.modifiers || 0, key: o.key, code: o.code || '', windowsVirtualKeyCode: o.vk || 0, nativeVirtualKeyCode: o.vk || 0, ...(o.text ? { text: o.text, unmodifiedText: o.text } : {}) });
      const parts = pos[0].split('+');
      const main = parts.pop();
      const mods = parts.map(m => m.toLowerCase());
      let modifiers = 0; for (const m of mods) modifiers |= (MOD[m] || 0);
      for (const m of mods) { const mk = MODKEY[m]; if (mk) await kev('keyDown', { ...mk, modifiers }); }
      const nk = NAMED[main.toLowerCase()] || charInfo(main);
      // com Alt/Ctrl/Meta não se manda `text` — senão o app recebe o caractere solto
      const withText = (modifiers & (MOD.alt | MOD.ctrl | MOD.meta)) ? {} : (nk.text ? { text: nk.text } : (main.length === 1 ? { text: main } : {}));
      await kev('keyDown', { key: nk.key, code: nk.code, vk: nk.vk, modifiers, ...withText });
      await kev('keyUp', { key: nk.key, code: nk.code, vk: nk.vk, modifiers });
      for (const m of [...mods].reverse()) { const mk = MODKEY[m]; if (mk) await kev('keyUp', { ...mk, modifiers: 0 }); }
      await sleep(300);
      journal({ a: 'key', combo: pos[0] });
      console.log('SHOT', await raw.shot());
      break;
    }

    default:
      console.error(fs.readFileSync(new URL(import.meta.url), 'utf-8').split('\n').slice(24, 40).join('\n').replace(/^\/\/ ?/gm, ''));
      process.exit(1);
  }
} finally {
  raw.close();
}
