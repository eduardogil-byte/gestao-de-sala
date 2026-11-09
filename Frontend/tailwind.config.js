/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        ink: "var(--color-ink)",
        "muted-ink": "var(--color-muted-ink)",
        line: "var(--color-line)",
        navy: { 950: "#0c1728", 900: "#122238", 800: "#1b324c", 700: "#284765" },
        skybrand: {
          50: "#eef6ff",
          100: "#dceefe",
          500: "#3987d8",
          600: "#2473c7",
          700: "#195aa2",
        },
      },
      borderRadius: { panel: "var(--radius-panel)", control: "var(--radius-control)" },
      boxShadow: { soft: "var(--shadow-soft)" },
    },
  },
  plugins: [],
};
