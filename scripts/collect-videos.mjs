import { readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
const OUT = process.argv[2];
if (!OUT) { console.error("usage: collect-videos.mjs <outdir>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const report = JSON.parse(readFileSync("test-results/report.json", "utf8"));
const slug = (title) => {
  const m = title.match(/^US-(\d+)/);
  const names = { 1:"start-session", 2:"add-officer", 3:"assign-officer", 4:"query-export-csv", 5:"export-and-merge", 6:"lock-session", 7:"recruitment-hire", 8:"compliance", 9:"leave", 10:"planning", 11:"audit" };
  return m ? `us${m[1]}-${names[m[1]]}` : title.toLowerCase().replace(/\W+/g,"-");
};
const vids = [];
function walk(suite) {
  for (const s of suite.suites || []) walk(s);
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      for (const r of t.results || []) {
        const v = (r.attachments || []).find(a => a.name === "video");
        if (v && existsSync(v.path)) vids.push({ title: spec.title, path: v.path });
      }
    }
  }
}
for (const s of report.suites || []) walk(s);
for (const v of vids) {
  const dest = `${OUT}/${slug(v.title)}.webm`;
  copyFileSync(v.path, dest);
  console.log(slug(v.title) + ".webm  <=  " + v.title);
}
console.log(`\ncopied ${vids.length} videos to ${OUT}`);
