/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'industrial-dark': '#121212',
        'copper': '#b87333',
        'copper-light': '#da8a47',
        'gold-aged': '#c5b358',
      }
    },
  },
  plugins: [],
}
