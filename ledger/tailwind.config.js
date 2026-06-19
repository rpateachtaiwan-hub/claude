/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色 #3962B2 及延伸色
        brand: { DEFAULT: '#3962B2', dark: '#2C4D8C', light: '#6E8FCB', soft: '#ECF1FA' },
        ink: '#2D3340',
        accent: { DEFAULT: '#C2453B', dark: '#9E372F' }, // 與藍主色相容的暖色（支出/警示）
      },
    },
  },
}
