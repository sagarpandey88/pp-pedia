/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      spacing: {
        '4.5': '1.125rem',
      },
      borderWidth: {
        '3': '3px',
      },
      colors: {
        slate: {
          850: '#151e2e',
        },
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        power: {
          purple: '#742774',
          blue: '#0078d4',
          teal: '#008272',
          orange: '#d83b01',
        }
      },
    },
  },
  plugins: [],
}

