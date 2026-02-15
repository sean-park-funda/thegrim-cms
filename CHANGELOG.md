# Changelog

## [Unreleased]

### Fixed
- Fixed build error on Vercel: `Module not found: Can't resolve '@/lib/supabase/server'`
- Created `lib/supabase/server.ts` using `@supabase/ssr` to support Server Side Rendering and API routes.
- Updated accounting API routes to use the new Supabase server client.
