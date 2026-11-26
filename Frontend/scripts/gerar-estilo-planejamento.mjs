// Gera src/components/planning/origin.css a partir das folhas do SalaGest-Frontend-Novo,
// restringindo cada regra a .sgp para não afetar as demais telas.
// Uso: node scripts/gerar-estilo-planejamento.mjs "C:/caminho/SalaGest-Frontend-Novo"
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const origin = process.argv[2];
if (!origin) throw new Error("Informe a pasta do frontend de referência.");
const read = (path) => readFileSync(join(origin, "src", path), "utf8");

const markup = ["features/planning/PlanningPage.tsx", "features/reservations/ManagerPlanning.tsx",
  "features/reservations/PlanningReservationTable.tsx", "features/planning/PlanningIssuePanel.tsx"].map(read).join("\n");
const known = new Set(markup.match(/[A-Za-z][\w-]*/g));
const allowed = (name) => known.has(name) || /^(is-|severity-|kind-|has-)/.test(name);

function scope(selector) {
  if (/^(html)\b/.test(selector)) return null;
  const classes = [...selector.replace(/\[[^\]]*\]/g, "").matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]);
  if (!classes.every(allowed)) return null;
  const theme = selector.match(/^:root(\[data-theme=(?:"|')?\w+(?:"|')?\])\s*(.*)$/);
  if (theme) return `:root${theme[1]} ${scope(theme[2] || ":root") ?? ".sgp"}`;
  if (selector === ":root" || selector === "body") return ".sgp";
  if (selector === "*") return ":where(.sgp), :where(.sgp) *";
  if (selector.startsWith(":root ")) return `.sgp ${selector.slice(6)}`;
  // O teste de consistência exige h1 no cabeçalho; a referência usa h2.
  if (selector.includes(".planning-heading")) selector = selector.replace(/\bh2\b/, "h1");
  // Regras só de elemento ficam com a especificidade original, para não sobrepor componentes embutidos.
  // "html" supera o preflight do Tailwind sem alcançar a especificidade de uma classe.
  return classes.length ? `.sgp ${selector}` : `html :where(.sgp) ${selector}`;
}

const files = ["styles.css", "courses.css", "environments.css", "teachers.css", "classes.css", "planning.css", "reservations.css", "modern.css"];
const output = [];
for (const file of files) {
  const tree = postcss.parse(read(file));
  tree.walkAtRules((rule) => { if (rule.name === "tailwind" || rule.name === "import") rule.remove(); });
  tree.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
    const selectors = rule.selectors.map(scope).filter(Boolean);
    if (selectors.length) rule.selectors = selectors; else rule.remove();
  });
  tree.walkAtRules((rule) => { if (rule.nodes && rule.nodes.length === 0) rule.remove(); });
  tree.walkComments((comment) => comment.remove());
  output.push(`/* ${file} */`, tree.toString().replace(/\n{2,}/g, "\n").trim());
}
// A referência fixa várias cores pensadas só para o tema escuro. No tema claro elas viram tokens.
const light = {
  "--field-surface": ["#141e2e"], "--card": ["#101827"], "--page": ["#0a1020"],
  "--subtle": ["#223752", "#20314a", "#2d4059"], "--primary-soft": ["#142c57", "#13294a", "#213c5d", "#2d5079"],
  "--success-bg": ["#123e35"], "--warning-bg": ["#433120"],
  "--primary": ["#78aaff", "#a6cbff", "#91bbf4", "#8ab9ff", "#cde3ff", "#c5dcfd", "#c4b5fd"],
  "--text": ["#eff6ff", "#d7e7fa", "#dbe7fb"], "--body": ["#bed1e7"], "--muted": ["#b5c5db", "#b3c8e5", "#b6c8e5", "#7e91ac", "#8da2bf"],
  "--success": ["#70d6b1", "#4fc99a"], "--warning": ["#ffc467", "#e8b04a"], "--line": ["#2c4c7b", "#355170"],
};
const token = new Map(Object.entries(light).flatMap(([name, colors]) => colors.map((color) => [color, `var(${name})`])));
const overrides = [];
postcss.parse(output.join("\n")).walkRules((rule) => {
  if (rule.parent.type !== "root" || rule.selector.includes("data-theme")) return;
  const declarations = rule.nodes.filter((node) => node.type === "decl" && !node.prop.startsWith("--") && /^(color|background|border)/.test(node.prop))
    .map((node) => {
      // var(--x, #escuro) usa o token do próprio destino no tema claro.
      const value = node.value.replace(/var\(--[\w-]+,\s*(#[0-9a-f]{6})\)|#[0-9a-f]{6}/gi, (match, fallback) => token.get((fallback ?? match).toLowerCase()) ?? match);
      return value === node.value ? null : `${node.prop}:${value}${node.important ? "!important" : ""}`;
    }).filter(Boolean);
  if (declarations.length) overrides.push(`${rule.selectors.map((selector) => `:root[data-theme="light"] ${selector}`).join(",")}{${declarations.join(";")}}`);
});
output.push("/* tema claro */", ...overrides);

const target = new URL("../src/components/planning/origin.css", import.meta.url);
writeFileSync(target, `/* GERADO por scripts/gerar-estilo-planejamento.mjs — não editar à mão. */\n${output.join("\n")}\n`);
console.log("origin.css gerado");
