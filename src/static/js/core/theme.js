// Theme = colors + spacing + typography + effects. Stored in the layout document, validated here,
// and applied to the page as CSS variables (--wb-*), which dashboard.css and every card stylesheet use.

export const COLOR_FIELDS = [
  { key: "background", label: "Background" },
  { key: "surface", label: "Card background" },
  { key: "border", label: "Card border" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Muted text" },
  { key: "textFaint", label: "Faint text" },
  { key: "accent", label: "Accent" },
  { key: "positive", label: "Positive / up" },
  { key: "negative", label: "Negative / down" },
];

export const FONT_STACKS = [
  { label: "System UI", value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Monospace", value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: "Rounded", value: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, system-ui, sans-serif' },
];

const BASE = {
  spacing: { gap: 16, padding: 24, cardPadding: 16, radius: 12, borderWidth: 1 },
  typography: { fontFamily: FONT_STACKS[0].value, scale: 1 },
  effects: { shadow: true },
};

export const PRESETS = {
  dark: {
    label: "Dark",
    colors: {
      background: "#080808",
      surface: "#121212",
      border: "#121212",
      text: "#ffffff",
      textMuted: "#999999",
      textFaint: "#666666",
      accent: "#ffffff",
      positive: "#20d879",
      negative: "#ff5252",
    },
  },
  light: {
    label: "Light",
    colors: {
      background: "#f1f5f9",
      surface: "#ffffff",
      border: "#e2e8f0",
      text: "#0f172a",
      textMuted: "#475569",
      textFaint: "#94a3b8",
      accent: "#0284c7",
      positive: "#16a34a",
      negative: "#dc2626"
    },
  },
  midnight: {
    label: "Midnight",
    colors: { 
      background: "#000000", 
      surface: "#0b0f19", 
      border: "#1f2937", 
      text: "#e5e7eb", 
      textMuted: "#9ca3af", 
      textFaint: "#6b7280", 
      accent: "#a78bfa", 
      positive: "#34d399", 
      negative: "#fb7185" 
    },
  },
  solarized: {
    label: "Solarized Dark",
    colors: { 
      background: "#002b36", 
      surface: "#073642", 
      border: "#586e75", 
      text: "#eee8d5", 
      textMuted: "#93a1a1", 
      textFaint: "#657b83", 
      accent: "#268bd2", 
      positive: "#859900", 
      negative: "#dc322f" 
    },
  },
  "high-contrast": {
    label: "High contrast",
    colors: { background: "#000000", 
      surface: "#000000", 
      border: "#ffffff", 
      text: "#ffffff", 
      textMuted: "#e5e5e5", 
      textFaint: "#bdbdbd", 
      accent: "#ffff00", 
      positive: "#00ff6a", 
      negative: "#ff4d4d" 
    },
    spacing: { borderWidth: 2 },
    effects: { shadow: false },
  },
};

export const DEFAULT_PRESET = "dark";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT_OK = /^[\w\s,"'.\-]{1,200}$/;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const num = (v, fb) => (v === null || v === "" || !Number.isFinite(Number(v)) ? fb : Number(v));
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function expandHex(hex) {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

// A complete, valid theme for a preset (used by the "apply preset" button).
export function presetTheme(name) {
  const p = PRESETS[name] ?? PRESETS[DEFAULT_PRESET];
  const preset = PRESETS[name] ? name : DEFAULT_PRESET;
  return {
    preset,
    colors: { ...p.colors },
    spacing: { ...BASE.spacing, ...p.spacing },
    typography: { ...BASE.typography, ...p.typography },
    effects: { ...BASE.effects, ...p.effects },
  };
}

// Anything in, valid theme out. Unknown keys are dropped, bad values fall back to the preset's.
export function normalizeTheme(raw) {
  const src = isObject(raw) ? raw : {};
  const base = presetTheme(src.preset);

  const colors = { ...base.colors };
  for (const { key } of COLOR_FIELDS) {
    const v = src.colors?.[key];
    if (typeof v === "string" && HEX.test(v.trim())) colors[key] = expandHex(v.trim());
  }

  const s = src.spacing ?? {};
  const spacing = {
    gap: clamp(Math.round(num(s.gap, base.spacing.gap)), 0, 16),
    padding: clamp(Math.round(num(s.padding, base.spacing.padding)), 0, 24),
    cardPadding: clamp(Math.round(num(s.cardPadding, base.spacing.cardPadding)), 0, 24),
    radius: clamp(Math.round(num(s.radius, base.spacing.radius)), 0, 30),
    borderWidth: clamp(Math.round(num(s.borderWidth, base.spacing.borderWidth)), 0, 0),
  };

  const t = src.typography ?? {};
  const typography = {
    fontFamily: typeof t.fontFamily === "string" && FONT_OK.test(t.fontFamily) ? t.fontFamily : base.typography.fontFamily,
    scale: clamp(Math.round(num(t.scale, base.typography.scale) * 100) / 100, 0.5, 2),
  };

  const effects = { shadow: typeof src.effects?.shadow === "boolean" ? src.effects.shadow : base.effects.shadow };

  return { preset: base.preset, colors, spacing, typography, effects };
}

function rgba(hex, alpha) {
  const h = expandHex(hex);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function themeToCssVars(theme) {
  const t = normalizeTheme(theme);
  const c = t.colors;
  return {
    "--wb-bg": c.background,
    "--wb-surface": c.surface,
    "--wb-border": c.border,
    "--wb-text": c.text,
    "--wb-text-muted": c.textMuted,
    "--wb-text-faint": c.textFaint,
    "--wb-accent": c.accent,
    "--wb-positive": c.positive,
    "--wb-positive-bg": rgba(c.positive, 0.16),
    "--wb-negative": c.negative,
    "--wb-negative-bg": rgba(c.negative, 0.16),
    "--wb-gap": `${t.spacing.gap}px`,
    "--wb-padding": `${t.spacing.padding}px`,
    "--wb-card-padding": `${t.spacing.cardPadding}px`,
    "--wb-radius": `${t.spacing.radius}px`,
    "--wb-border-width": `${t.spacing.borderWidth}px`,
    "--wb-font": t.typography.fontFamily,
    "--wb-font-scale": String(t.typography.scale),
    "--wb-shadow": t.effects.shadow ? "0 4px 6px -1px rgba(0, 0, 0, 0.25)" : "none",
  };
}

export function applyTheme(theme, el = document.documentElement) {
  for (const [k, v] of Object.entries(themeToCssVars(theme))) el.style.setProperty(k, v);
  // Cards that size things in JS (fitText) re-measure after a theme change.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("wb:relayout"));
}
