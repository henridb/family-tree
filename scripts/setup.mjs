import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { SetupError, setupProject } from "./setup-project.mjs";

if (process.argv.length !== 2 || !process.stdin.isTTY) {
  console.error(
    "Run npm run setup in an interactive terminal at the repository root. Passwords are entered privately, not as command-line arguments.",
  );
  process.exitCode = 1;
} else {
  let hidden = false;
  const controller = new AbortController();
  const output = new Writable({
    /**
     * Forward visible prompts while discarding secret input echoed by readline.
     * @param {string | Uint8Array} chunk
     * @param {BufferEncoding} encoding
     * @param {(error?: Error | null) => void} callback
     * @returns {void}
     */
    write(chunk, encoding, callback) {
      if (hidden) callback();
      else process.stdout.write(chunk, encoding, callback);
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  prompt.on("SIGINT", () => {
    controller.abort();
    prompt.close();
  });
  prompt.on("close", () => controller.abort());
  /**
   * Ask one visible or hidden question, rejecting immediately when setup is cancelled.
   * @param {string} question
   * @param {import('./setup-project.mjs').PromptOptions} [options]
   * @returns {Promise<string>}
   */
  async function ask(question, { secret = false } = {}) {
    hidden = secret;
    try {
      if (secret) process.stdout.write(question);
      return await prompt.question(secret ? "" : question, {
        signal: controller.signal,
      });
    } finally {
      if (secret) process.stdout.write("\n");
      hidden = false;
    }
  }
  try {
    console.log(
      "Set up this local family tree. Existing credentials and family data are preserved.",
    );
    console.log(
      "Password recovery copies are stored in the private .env file. They are reversible, not encrypted.",
    );
    await setupProject({
      directory: process.cwd(),
      ask,
      /** @type {import('./setup-project.mjs').Report} */
      info: (message) => console.log(message),
    });
    console.log(
      "Setup complete. Start or restart the app with npm run dev, then open /edit at the address it prints.",
    );
    console.log(
      "Use the owner password to enter data, and / to preview the saved tree.",
    );
    console.log(
      "For Vercel hosting without a local Vercel CLI, follow docs/setup.md.",
    );
  } catch (error) {
    console.error(
      controller.signal.aborted
        ? "Setup cancelled. Rerun npm run setup to continue; completed steps will be kept."
        : error instanceof SetupError
          ? error.message
          : "Setup could not finish. Check file permissions and installed dependencies, then rerun npm run setup. Completed steps are preserved; no automatic retry was attempted.",
    );
    process.exitCode = 1;
  } finally {
    prompt.close();
  }
}
