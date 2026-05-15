/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#dceeff',
          200: '#b8ddff',
          300: '#83c3ff',
          400: '#479fff',
          500: '#1f7cff',
          600: '#0f5de0',
          700: '#0d48b3',
          800: '#103e8e',
          900: '#123572',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
