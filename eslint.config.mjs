import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * Reglas de arquitectura hexagonal: las dependencias apuntan siempre hacia el dominio.
 * Cada capa tiene prohibido importar de las capas externas.
 */
const capasExternasAlDominio = [
  {
    group: ['**/application/**', '**/infrastructure/**', '**/ui/**', '@/app/**', '@/worker/**'],
    message: 'El dominio no puede depender de aplicación, infraestructura ni presentación.',
  },
  {
    group: [
      'next',
      'next/**',
      'react',
      'react/**',
      'react-dom',
      '@prisma/**',
      '@/generated/**',
      'pg',
      'pino',
      'pg-boss',
    ],
    message: 'El dominio debe ser TypeScript puro, sin frameworks ni librerías de infraestructura.',
  },
];

const capasExternasAAplicacion = [
  {
    group: ['**/infrastructure/**', '**/ui/**', '@/app/**', '@/worker/**'],
    message:
      'Los casos de uso dependen de puertos (interfaces), no de implementaciones. Conéctalas en composition-root.ts.',
  },
  {
    group: [
      'next',
      'next/**',
      'react',
      'react/**',
      '@prisma/**',
      '@/generated/**',
      'pg',
      'pino',
      'pg-boss',
    ],
    message: 'La capa de aplicación no puede depender de frameworks ni de infraestructura.',
  },
];

/** La presentación llama casos de uso; nunca accede a la base de datos directamente. */
const accesoADatosDesdePresentacion = [
  {
    group: ['@prisma/**', '@/generated/**', 'pg', '@/shared/infrastructure/prisma/**'],
    message:
      'Las páginas y componentes no consultan la base de datos: llaman a un caso de uso (§3).',
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Reglas con información de tipos para código TypeScript.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },

  {
    files: ['src/**/domain/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: capasExternasAlDominio }] },
  },
  {
    files: ['src/**/application/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: capasExternasAAplicacion }] },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/**/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: accesoADatosDesdePresentacion }] },
  },

  // Archivos de configuración en JS: sin reglas con tipos.
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Desactiva reglas de estilo que Prettier ya controla. Debe ir al final.
  prettier,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'src/generated/**',
  ]),
]);
