/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ocean: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
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
