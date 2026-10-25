/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        white: 'var(--white)',
        cream: 'var(--cream)',
        grey: 'var(--grey)',
        slate: 'var(--slate)',
        charcoal: 'var(--charcoal)',
        ink: 'var(--ink)',
        mute: 'var(--mute)',
        line: 'var(--line)',
        overlay: 'var(--overlay)',
        alert: 'var(--alert)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        input: 'var(--radius-input)',
        video: 'var(--radius-video)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        soft: 'var(--shadow)',
      },
      maxWidth: {
        shell: 'var(--max-width)',
      },
    },
  },
};
