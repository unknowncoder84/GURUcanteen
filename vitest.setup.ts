// Provide a fake IndexedDB implementation in the jsdom test environment so
// Dexie-backed code (lib/db/*, lib/backup.ts, lib/import/commit.ts) can run
// in automated tests without a real browser.
import 'fake-indexeddb/auto'
