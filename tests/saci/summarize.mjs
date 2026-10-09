// Consolida os results.json da bateria em tabelas Markdown.
// Uso: node summarize.mjs <dir-com-subpastas-motor-fonte> > resumo.md
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'results';
const runs = fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'results.json')))
  .map(d => JSON.parse(fs.readFileSync(path.join(dir, d, 'results.json'), 'utf8')));
const ORDER = ['chromium', 'firefox', 'webkit'];
runs.sort((a, b) => ORDER.indexOf(a.engine) - ORDER.indexOf(b.engine) || a.source.localeCompare(b.source));

const uniq = a => [...new Set(a)];
const errMsgs = errs => uniq((errs || []).map(e => `${e.type}: ${e.msg}`));
const statics = m => m.state.pins.filter(p => !p.pinned).map(p => p.key);
// O zoom da abertura (hero) é intencional nos primeiros 5–10%; separamos para não poluir.
const overflows = m => Object.entries(m.scenes || {}).flatMap(([k, v]) => v.filter(o => !o.carousel).map(o => ({ scene: k, ...o })));
const realOv = m => overflows(m).filter(o => o.scene !== 'hero');

const out = [];
out.push('# Resultado consolidado da bateria\n');
for (const r of runs) out.push(`- **${r.engine} ${r.version}** · ${r.source} · ${r.url} · ${r.results.length} perfis`);
out.push('');
out.push('Legenda: **ok** = sem erro de JS e todas as cenas animadas; **falha** = erro de JS, cena estática ou queda do teste. "estáticas" lista as cenas que caíram na versão empilhada. "texto fora" = textos visíveis (opacidade > 0,5) fora da cena ou da tela, sem contar o carrossel da Rede e o zoom de saída da abertura.\n');

out.push('## Tabela motor × perfil × modo\n');
out.push('| motor | fonte | perfil | viewport | reduce | no-preference | estáticas | texto fora (cenas) | erros JS |');
out.push('|---|---|---|---|---|---|---|---|---|');
for (const r of runs) for (const x of r.results) {
  const cells = [], st = new Set(), ov = new Set(), er = new Set();
  for (const mode of ['reduce', 'no-preference']) {
    const m = x.modes[mode];
    if (!m || m.fatal) { cells.push('**falha** (queda)'); if (m) er.add('fatal: ' + m.fatal.slice(0, 80)); continue; }
    const s = statics(m), e = errMsgs(m.errors).filter(t => !t.startsWith('requestfailed'));
    s.forEach(k => st.add(k)); e.forEach(t => er.add(t)); realOv(m).forEach(o => ov.add(o.scene));
    cells.push(e.length || s.length ? '**falha**' : 'ok');
  }
  const p = x.profile, vp = `${p.w}×${p.h}`;
  out.push(`| ${r.engine} | ${r.source} | ${p.id} | ${vp} | ${cells[0]} | ${cells[1]} | ${[...st].join(', ') || '—'} | ${[...ov].join(', ') || '—'} | ${[...er].map(t => t.replace(/\|/g, '/')).join('; ') || '—'} |`);
}

out.push('\n## reduce × no-preference: há diferença?\n');
let diffs = 0;
for (const r of runs) for (const x of r.results) {
  const a = x.modes.reduce, b = x.modes['no-preference'];
  if (!a || !b || a.fatal || b.fatal) continue;
  const sa = JSON.stringify(a.state.pins.map(p => [p.key, p.pinned])), sb = JSON.stringify(b.state.pins.map(p => [p.key, p.pinned]));
  if (sa !== sb || a.state.cine !== b.state.cine) { diffs++; out.push(`- ${r.engine}/${r.source}/${x.profile.id}: reduce=${statics(a).join(',') || 'nenhuma estática'} · no-pref=${statics(b).join(',') || 'nenhuma estática'}`); }
}
if (!diffs) out.push('Nenhuma: em todas as combinações, "reduce" e "no-preference" produzem o mesmo conjunto de cenas animadas.');

out.push('\n## Textos fora da cena ou da tela (detalhe)\n');
const ovAgg = new Map();
for (const r of runs) for (const x of r.results) for (const mode of ['no-preference']) {
  const m = x.modes[mode]; if (!m || m.fatal) continue;
  for (const o of realOv(m)) {
    const k = `${o.scene} · \`${o.el}\` · "${o.text}" · ${o.why}`;
    if (!ovAgg.has(k)) ovAgg.set(k, new Set());
    ovAgg.get(k).add(`${r.engine}:${x.profile.id}`);
  }
}
for (const [k, v] of [...ovAgg].sort((a, b) => b[1].size - a[1].size)) out.push(`- ${k} — ${v.size} combinações (ex.: ${[...v].slice(0, 6).join(', ')})`);
if (!ovAgg.size) out.push('Nenhum.');

out.push('\n## Abertura (zoom de saída) — textos que saem da tela no início\n');
const heroAgg = new Set();
for (const r of runs) for (const x of r.results) { const m = x.modes['no-preference']; if (m && !m.fatal) if (overflows(m).some(o => o.scene === 'hero')) heroAgg.add(`${r.engine}:${x.profile.id}`); }
out.push(heroAgg.size ? `${heroAgg.size} combinações (ex.: ${[...heroAgg].slice(0, 8).join(', ')})` : 'Nenhuma.');

out.push('\n## Rolagem contínua e navegação\n');
out.push('| motor | fonte | perfil | modo | passos | progresso início→fim | recuos da barra | itens de nav ativados / total |');
out.push('|---|---|---|---|---|---|---|---|');
for (const r of runs) for (const x of r.results) for (const mode of ['reduce', 'no-preference']) {
  const m = x.modes[mode]; if (!m || m.fatal || !m.scroll) continue;
  const s = m.scroll, bad = s.backwards || s.progEnd < 0.99 || s.activeDistinct < s.navCount;
  if (bad || process.env.ALL) out.push(`| ${r.engine} | ${r.source} | ${x.profile.id} | ${mode} | ${s.steps} | ${s.progStart}→${s.progEnd} | ${s.backwards} | ${s.activeDistinct}/${s.navCount} |`);
}
out.push('\n(Só aparecem linhas com problema; as demais chegaram a 100%, sem recuo, e ativaram todos os itens da navegação.)');

out.push('\n## Barra do Safari: 664 → 760 → 664 px no meio de uma cena\n');
out.push('| motor | fonte | perfil | cena | scrollY mudou? | estado mudou ao crescer? | voltou igual? | faixa vazia abaixo da cena a 760 px | cenas animadas (664/760/664) |');
out.push('|---|---|---|---|---|---|---|---|---|');
for (const r of runs) for (const x of r.results) {
  const m = x.modes['no-preference']; if (!m || m.fatal || !m.resize) continue;
  const z = m.resize;
  out.push(`| ${r.engine} | ${r.source} | ${x.profile.id} | ${z.target} | ${z.dyAC ? z.dyAC + ' px' : 'não'} | ${z.sigChangedAB ? 'sim' : 'não'} | ${z.sigRestoredAC ? 'sim' : '**não**'} | ${z.gapAt760 != null ? z.gapAt760 + ' px' : '—'} | ${z.a.pinned}/${z.b.pinned}/${z.c.pinned} |`);
}

out.push('\n## Fontes externas bloqueadas\n');
for (const r of runs) for (const x of r.results) {
  const f = x.fontsBlocked, m = x.modes['no-preference'];
  if (!f || f.fatal || !m || m.fatal) { out.push(`- ${r.engine}/${r.source}/${x.profile.id}: queda ${f && f.fatal}`); continue; }
  const sA = statics(m).join(','), sB = f.state.pins.filter(p => !p.pinned).map(p => p.key).join(',');
  const oA = realOv(m).length, oB = Object.entries(f.scenes).flatMap(([k, v]) => k === 'hero' ? [] : v.filter(o => !o.carousel)).length;
  // o próprio bloqueio gera "Failed to load resource"; não conta como achado
  const e = errMsgs(f.errors).filter(t => !/Failed to load resource|ERR_FAILED|NS_ERROR|Load request cancelled|access control|fonts\./i.test(t));
  if (sA !== sB || oA !== oB || e.length) out.push(`- ${r.engine}/${r.source}/${x.profile.id}: estáticas ${sA || '—'} → ${sB || '—'}; textos fora ${oA} → ${oB}${e.length ? '; erros: ' + e.join('; ') : ''}`);
}
out.push('(Só aparecem perfis em que algo mudou com as fontes bloqueadas.)');

out.push('\n## Navegador antigo (sem Element.prototype.scrollTo e sem window.matchMedia)\n');
out.push('| motor | fonte | perfil | erros | itens de nav ativados | aba Fase 3 |');
out.push('|---|---|---|---|---|---|');
for (const r of runs) for (const x of r.results) {
  const o = x.oldBrowser; if (!o) continue;
  if (o.fatal) { out.push(`| ${r.engine} | ${r.source} | ${x.profile.id} | queda: ${o.fatal.slice(0, 80)} | — | — |`); continue; }
  const e = errMsgs(o.errors);
  out.push(`| ${r.engine} | ${r.source} | ${x.profile.id} | ${e.length ? e.length + 'x tipos: ' + e.join('; ').slice(0, 140) + ` (${o.errors.length} ocorrências)` : '—'} | ${o.scroll.activeDistinct}/${o.scroll.navCount} | ${o.tabClick} |`);
}

console.log(out.join('\n'));
