/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 取自 ROUTOR logo 的色彩延伸
        brand: { DEFAULT: '#2E6FD6', dark: '#1F569F', light: '#5B93E8', soft: '#EAF1FC' },
        ink: '#2D3340',
        accent: { DEFAULT: '#E2483D', dark: '#C13328' },
      },
    },
  },
  plugins: [],
}
