/** @type {import('lint-staged').Configuration} */
const config = {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,css,md,yml,yaml}': ['prettier --write'],
  '*.prisma': ['prisma format --schema'],
};

export default config;
