import { Geist, Geist_Mono } from 'next/font/google';

// Fuentes provisionales (preset "nova" de shadcn). La tipografía definitiva se decide en la Fase 3.
const sans = Geist({ variable: '--font-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/** Clases que declaran las variables CSS de las fuentes; van en el elemento <html>. */
export const clasesDeFuentes = `${sans.variable} ${mono.variable}`;
