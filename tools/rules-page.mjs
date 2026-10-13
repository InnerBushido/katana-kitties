/* ---------------------------------------------------------------------------
   Build the rule register's review page out of RULES.md.

     node tools/rules-page.mjs           write out/rules-page.html
     node tools/rules-page.mjs --check   parse only, and say what was found

   WHY THE PAGE IS GENERATED. RULES.md is the register Richard edits, and the
   page at claude.ai is where he marks each rule KEEP / CHANGE / REMOVE. Two
   hand-kept copies of one list is the exact failure the register was written
   to catch: on the day it was compiled it found the nine non-negotiables
   already disagreeing across CLAUDE.md, PROJECT.md §9, the Field Guide and a
   memory file. So the words exist once, in RULES.md, and this is the only
   thing that turns them into the page.

   IT DOES NOT PUBLISH. That needs the Artifact tool, so an agent session runs
   this and then publishes out/rules-page.html to the URL named at the top of
   RULES.md, the SAME url, so Richard's marks (kept in the page's store, keyed
   by rule id) stay attached. Renaming a rule's id orphans its mark, so don't.

   THE GRAMMAR IS RULES.md's OWN: `## A. Section`, `### ID · Title`, then
   `- **Key:** value` bullets. Status / Your call / Note are pulled out rather
   than shown as fields: the status becomes the pill and the other two are the
   page's own controls.
--------------------------------------------------------------------------- */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const md = readFileSync(new URL('RULES.md', root), 'utf8').replace(/\r\n/g, '\n');

export function parseRules(text) {
  const sections = [];
  let sec = null, rule = null;
  for (const line of text.split('\n')) {
    let m;
    if ((m = line.match(/^## ([A-Z])\. (.+)$/))) {
      sec = { letter: m[1], title: m[2], intro: '', rules: [] };
      sections.push(sec); rule = null; continue;
    }
    if (!sec) continue;
    if ((m = line.match(/^### (\S+) · (.+)$/))) {
      rule = { id: m[1], title: m[2], fields: [] };
      sec.rules.push(rule); continue;
    }
    if ((m = line.match(/^- \*\*(.+?):?\*\*:?\s*(.*)$/))) {
      if (rule) rule.fields.push({ key: m[1].replace(/:$/, ''), value: m[2] });
      continue;
    }
    if (!rule && line.trim() && line.trim() !== '---') sec.intro += (sec.intro ? ' ' : '') + line.trim();
  }
  return sections;
}

const sections = parseRules(md);
for (const s of sections) for (const r of s.rules) {
  const st = r.fields.find((f) => f.key === 'Status');
  r.status = st ? st.value.trim() : 'active';
  r.fields = r.fields.filter((f) => !['Status', 'Your call', 'Note'].includes(f.key));
}
const count = sections.reduce((n, s) => n + s.rules.length, 0);

if (process.argv.includes('--check')) {
  console.log(`${sections.length} sections, ${count} rules`);
} else {
  const html = readFileSync(new URL('docs/artifact/rules-template.html', root), 'utf8')
    .replace('/*RULES_JSON*/[]', JSON.stringify(sections).replace(/</g, '\\u003c'))
    .replaceAll('{{COUNT}}', String(count));
  mkdirSync(new URL('out/', root), { recursive: true });
  writeFileSync(new URL('out/rules-page.html', root), html);
  console.log(`${sections.length} sections, ${count} rules -> out/rules-page.html`);
  console.log('publish it to the URL at the top of RULES.md (the same url, so the marks stay)');
}
