/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ocean: {
          50:  '#e6fffa',
          100: '#b2f5ea',
          200: '#81e6d9',
          300: '#4fd1c5',
          400: '#38b2ac',
          500: '#319795',
          600: '#2c7a7b',
          700: '#285e61',
          800: '#234e52',
          900: '#1d4044',
          950: '#0d2b2e',
        },
        sand: {
          50: '#fefcf3',
          100: '#fdf6e3',
          200: '#faecc7',
          300: '#f5dd9a',
          400: '#edc85e',
          500: '#e0ad2b',
        },
        coral: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
        seafoam: {
          100: '#d1fae5',
          200: '#a7f3d0',
          400: '#34d399',
          500: '#10b981',
        },
        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
        },
      },
    },
  },
  plugins: [],
}
