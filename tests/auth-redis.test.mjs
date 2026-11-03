// Reuse the full HTTP authentication suite with Redis selected and SQLite unavailable.
process.env.FAMILY_TREE_TEST_LOGIN_STORE = "redis";
await import("./auth.test.mjs");
