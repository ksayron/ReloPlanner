import { createTheme, defaultVariantColorsResolver, type VariantColorsResolver } from '@mantine/core';

const variantColorResolver: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input);
  const isBrandTone = typeof input.color === 'string' && input.color.startsWith('brand');

  if (!isBrandTone || input.variant !== 'light') {
    return resolved;
  }

  const [baseColor] = String(input.color).split('.');
  return {
    background: `var(--mantine-color-${baseColor}-light)`,
    hover: `var(--mantine-color-${baseColor}-light-hover)`,
    color: `var(--mantine-color-${baseColor}-light-color)`,
    border: '1px solid transparent',
  };
};

export const appTheme = createTheme({
  fontFamily: 'Inter, Segoe UI, Roboto, sans-serif',
  primaryColor: 'brand',
  variantColorResolver,
  colors: {
    brand: [
      '#f6f4eb',
      '#e8f0f5',
      '#d7e8f1',
      '#c0ddef',
      '#a6d0ea',
      '#91C8E4',
      '#749BC2',
      '#5f8db7',
      '#4f88b0',
      '#4682A9',
    ],
  },
  defaultRadius: 'md',
  headings: {
    fontFamily: 'Inter, Segoe UI, Roboto, sans-serif',
    sizes: {
      h1: { fontSize: '2.2rem', lineHeight: '1.2', fontWeight: '700' },
      h2: { fontSize: '1.8rem', lineHeight: '1.25', fontWeight: '700' },
      h3: { fontSize: '1.3rem', lineHeight: '1.3', fontWeight: '600' },
    },
  },
});
