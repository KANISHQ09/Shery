/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#e8572a',
          hover: '#d44d22',
          soft: 'rgba(232,87,42,0.12)',
          border: 'rgba(232,87,42,0.3)',
        },
        surface: {
          base: '#0f0f0f',
          nav: '#111111',
          card: '#1a1a1a',
          card2: '#202020',
          hover: '#252525',
          input: '#1e1e1e',
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          soft: 'rgba(255,255,255,0.04)',
        },
        muted: {
          DEFAULT: '#5a5a5a',
          text: '#a0a0a0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      height: {
        screenNav: 'calc(100vh - 60px)',
      },
      minHeight: {
        screenNav: 'calc(100vh - 60px)',
      },
      keyframes: {
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        bounceDots: {
          '0%,80%,100%': { transform: 'translateY(0)', opacity: '.4' },
          '40%': { transform: 'translateY(-6px)', opacity: '1' },
        },
        landingLoad: {
          '0%': { transform: 'translateX(-110%)' },
          '55%,100%': { transform: 'translateX(155%)' },
        },
        // V2: Entrance animations for premium answer cards
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInFromTop: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInFromBottom: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        spin: 'spin 1s linear infinite',
        blink: 'blink 1s step-end infinite',
        bounceDots: 'bounceDots 1.2s ease-in-out infinite',
        // V2: Named entrance animations
        'fade-in': 'fadeIn 0.25s ease-out both',
        'slide-in-top': 'slideInFromTop 0.25s ease-out both',
        'slide-in-bottom': 'slideInFromBottom 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};
