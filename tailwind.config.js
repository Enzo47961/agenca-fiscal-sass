/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta do produto — usar estas em vez de cores soltas
        brand: {
          50: "#eef7ff",
          500: "#1570ef",
          600: "#175cd3",
          700: "#1849a9",
        },
      },
    },
  },
  plugins: [],
};
