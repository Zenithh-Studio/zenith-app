import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
  },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist-electron',
  splitting: false,
  sourcemap: true,
  clean: true,
  // Bundle internal workspace TS packages; packaged Electron cannot import .ts exports.
  noExternal: [/^@znith\//],
  // Native bindings and Drizzle ORM remain in node_modules for electron-builder.
  external: ['electron', 'better-sqlite3', 'drizzle-orm', 'drizzle-orm/better-sqlite3'],
});
