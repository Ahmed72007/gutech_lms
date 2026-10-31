import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Tests never reach Supabase: repositories are mocked. These values only satisfy env validation.
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'test-anon-key-000000000000',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-000000000000',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
    restoreMocks: false,
  },
})
