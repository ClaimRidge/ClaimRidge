import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // New dark+green design system
        ink: {
          DEFAULT: "#0d1117",
          50: "#1c2128",
          100: "#161b22",
          200: "#161b22",
          300: "#13181f",
          400: "#10151b",
          500: "#0d1117",
          600: "#0a0d12",
          700: "#07090d",
          800: "#040608",
          900: "#000000",
        },
        brand: {
          DEFAULT: "#16a34a",
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        surface: {
          DEFAULT: "#161b22",
          raised: "#1c2128",
          sunken: "#10151b",
          tint: "#0f1f15",
        },
        line: {
          DEFAULT: "#21262d",
          strong: "#30363d",
          subtle: "#1a1f26",
        },
        muted: {
          DEFAULT: "#8b949e",
          strong: "#b1bac4",
        },
        // Legacy aliases
        navy: {
          DEFAULT: "#0d1117",
          50: "#1c2128",
          100: "#161b22",
          200: "#161b22",
          300: "#21262d",
          400: "#161b22",
          500: "#0d1117",
          600: "#0a0d12",
          700: "#07090d",
          800: "#040608",
          900: "#000000",
        },
        teal: {
          DEFAULT: "#16a34a",
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "'Times New Roman'", "serif"],
        syne: ["var(--font-syne)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(22, 163, 74, 0.22)",
        "glow-lg": "0 0 48px rgba(22, 163, 74, 0.28)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-20px) rotate(6deg)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px) translateX(0px) rotate(0deg)" },
          "33%": { transform: "translateY(-30px) translateX(15px) rotate(8deg)" },
          "66%": { transform: "translateY(10px) translateX(-20px) rotate(-5deg)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.6", boxShadow: "0 0 0 0 rgba(24, 214, 104, 0.4)" },
          "50%": { opacity: "1", boxShadow: "0 0 0 8px rgba(24, 214, 104, 0)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        "float-slow": "float-slow 14s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "spin-slow": "spin-slow 30s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
