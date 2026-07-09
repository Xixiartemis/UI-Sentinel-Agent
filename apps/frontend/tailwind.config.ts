import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#647084",
        line: "#d7dde7",
        panel: "#ffffff",
        page: "#f4f6f8",
        accent: "#2f6b55",
        warning: "#b45309",
        danger: "#b42318",
      },
    },
  },
  plugins: [],
} satisfies Config;
