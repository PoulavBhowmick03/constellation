import type { Config } from "tailwindcss";

// Ported from the Stitch "Executive Alpha" design system.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#61f0cb",
        "primary-container": "#3dd3b0",
        "primary-fixed": "#6cfad5",
        "primary-fixed-dim": "#4addb9",
        "on-primary": "#00382c",
        "on-primary-container": "#005746",
        "surface-tint": "#4addb9",
        secondary: "#ffb955",
        "secondary-container": "#dc9100",
        "on-secondary-container": "#4f3100",
        tertiary: "#ffcdc8",
        error: "#ffb4ab",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        background: "#0A0B0F",
        surface: "#121317",
        "surface-dim": "#121317",
        "surface-bright": "#38393e",
        "surface-container-lowest": "#0d0e12",
        "surface-container-low": "#1a1b20",
        "surface-container": "#1f1f24",
        "surface-container-high": "#292a2e",
        "surface-container-highest": "#343439",
        "surface-variant": "#343439",
        "on-surface": "#e3e2e8",
        "on-surface-variant": "#bbcac3",
        "inverse-surface": "#e3e2e8",
        outline: "#85948e",
        "outline-variant": "#3c4a45",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        gutter: "24px",
        "margin-page": "40px",
        "card-padding": "20px",
      },
      fontFamily: {
        "headline-xl": ["var(--font-geist)", "Geist", "sans-serif"],
        "headline-lg": ["var(--font-geist)", "Geist", "sans-serif"],
        "headline-md": ["var(--font-geist)", "Geist", "sans-serif"],
        "body-md": ["var(--font-inter)", "Inter", "sans-serif"],
        "body-lg": ["var(--font-inter)", "Inter", "sans-serif"],
        "label-sm": ["var(--font-inter)", "Inter", "sans-serif"],
        "data-mono": ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      fontSize: {
        "label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "data-mono": ["13px", { lineHeight: "18px", fontWeight: "450" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-xl": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};

export default config;
