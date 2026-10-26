/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      colors: {
        navy: { 900: "#16273b", 800: "#20374e", 700: "#2b4560" },
        skybrand: {
          50: "#eef6ff",
          100: "#dceefe",
          500: "#3987d8",
          600: "#2473c7",
          700: "#195aa2",
        },
      },
      boxShadow: { soft: "0 4px 24px rgba(25,47,77,.04)" },
    },
  },
  plugins: [],
};
