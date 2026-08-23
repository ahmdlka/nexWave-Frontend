'use client';

import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import type { ReactNode } from 'react';

const theme = createTheme({
  palette: {
    primary: { main: '#0056D6', dark: '#0A1A4B', contrastText: '#ffffff' },
    secondary: { main: '#FF6600', contrastText: '#ffffff' },
    background: { default: '#0A1A4B', paper: '#ffffff' },
    text: { primary: '#202938', secondary: '#687386' },
  },
  shape: { borderRadius: 16 },
  typography: { fontFamily: 'var(--font-plus-jakarta), Arial, sans-serif' },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 12, fontWeight: 700, textTransform: 'none' } } },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});

export default function MaterialThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>;
}
