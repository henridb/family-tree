import { createServer } from "node:http";

/** @typedef {import('../../src/lib/family-document.ts').FamilyDocumentInput} FamilyDocumentInput */

/**
 * @typedef {import('../../src/server/family-store.ts').FamilyStoreBackend & {
 *   raw: string | null,
 *   reads: number,
 *   writes: number,
 *   readFailure: boolean,
 *   writeFailure: boolean,
 *   loseWriteResponse: boolean
 * }} MemoryBackend
 */

/** @typedef {[name: string, ...arguments: (string | number)[]]} RedisCommand */

/**
 * @callback RedisExecutor
 * @param {RedisCommand} command
 * @returns {unknown | Promise<unknown>} Redis reply, optionally produced asynchronously.
 */

/**
 * @typedef {object} RedisRestFixture
 * @property {object} state Mutable controls for the offline fixture.
 * @property {RedisCommand[]} state.commands Recorded SDK requests.
 * @property {Map<string, string>} state.values Raw stored JSON by Redis key.
 * @property {boolean} state.unavailable Return an availability error when enabled.
 * @property {boolean} state.invalidResult Return an invalid SDK result when enabled.
 * @property {string} url Loopback REST endpoint.
 * @property {() => Promise<void>} close Stop the server and its connections.
 */

/**
 * Create a fresh fictional document with one union, one child and one unconnected person.
 * @param {string} [title='Famille exemple']
 * @returns {FamilyDocumentInput} Input-shaped records with omitted default flags.
 */
export function exampleFamily(title = "Famille exemple") {
  return {
    schemaVersion: 1,
    revision: 0,
    title,
    rootPersonId: "alex",
    people: [
      {
        id: "alex",
        name: "Alex",
        surname: "Martin",
        sex: "male",
        birthdate: "1940",
      },
      { id: "bea", name: "Béatrice", surname: "Durand", sex: "female" },
      {
        id: "cam",
        name: "Camille",
        surname: "Martin",
        sex: "female",
        birthdate: "1970-02",
      },
      { id: "unconnected", name: "Lou", surname: "Petit", sex: "female" },
    ],
    partnerships: [
      { id: "unionab", personIds: ["alex", "bea"], childIds: ["cam"] },
    ],
  };
}

/**
 * Create an in-memory atomic storage fixture with operation counters and
 * injectable failures.
 *
 * The lost-response mode commits the replacement before throwing, modeling an
 * uncertain save outcome.
 *
 * @returns {MemoryBackend}
 */
export function memoryBackend() {
  return {
    raw: null,
    reads: 0,
    writes: 0,
    readFailure: false,
    writeFailure: false,
    loseWriteResponse: false,
    /**
     * Count the read and return raw fixture state unless a read failure is enabled.
     * @returns {Promise<string | null>}
     */
    async read() {
      this.reads++;
      if (this.readFailure) throw new Error("Fixture read failure");
      return this.raw;
    },
    /**
     * Count the write and replace matching raw state, optionally failing before
     * or after commitment.
     * @param {string | null} expected
     * @param {string} replacement
     * @returns {Promise<boolean>}
     */
    async compareAndSet(expected, replacement) {
      this.writes++;
      if (this.writeFailure) throw new Error("Fixture write failure");
      if (this.raw !== expected) return false;
      this.raw = replacement;
      if (this.loseWriteResponse) throw new Error("Fixture response lost");
      return true;
    },
  };
}

/**
 * Start a loopback REST fixture compatible with the Upstash SDK and return its
 * controls and cleanup.
 *
 * Record commands and support injected unavailable/invalid responses. The
 * default executor models GET and atomic replacement without running Lua; an
 * optional executor can route commands to the test's real Redis process.
 *
 * @param {RedisExecutor} [executor] Override the default command model.
 * @returns {Promise<RedisRestFixture>}
 */
export async function redisRestFixture(executor) {
  const state = {
    commands: [],
    values: new Map(),
    unavailable: false,
    invalidResult: false,
  };
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== "Bearer test-only-token") {
        throw new Error("Unexpected fixture authorization");
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const command = JSON.parse(Buffer.concat(chunks).toString());
      state.commands.push(command);
      response.setHeader("content-type", "application/json");
      if (state.unavailable) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "Fixture unavailable" }));
        return;
      }
      let result;
      if (executor) {
        result = await executor(command);
      } else if (command[0].toLowerCase() === "get") {
        result = state.values.get(command[1]) ?? null;
      } else if (command[0].toLowerCase() === "eval") {
        const [, , count, key, mode, expected, replacement] = command;
        if (count !== 1) throw new Error("Unexpected key count");
        const current = state.values.get(key) ?? null;
        result = (mode === "missing" ? current === null : current === expected)
          ? 1
          : 0;
        if (result) state.values.set(key, replacement);
      } else {
        throw new Error("Unexpected fixture command");
      }
      response.end(
        JSON.stringify({ result: state.invalidResult ? 2 : result }),
      );
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    state,
    url: `http://127.0.0.1:${server.address().port}`,
    /**
     * Close active fixture connections and wait for the loopback HTTP server to stop.
     * @returns {Promise<void>}
     */
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
