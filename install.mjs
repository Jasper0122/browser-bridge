#!/usr/bin/env node

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = dirname(fileURLToPath(import.meta.url))
const mcpDir = join(root, "mcp-server")
const extensionDir = join(root, "extension")
const mcpEntry = join(mcpDir, "dist", "index.js")
const extensionBuild = join(extensionDir, "build", "chrome-mv3-prod")

const args = new Set(process.argv.slice(2))
const skipBuild = args.has("--no-build")
const skipClaude = args.has("--no-claude")

function log(message = "") {
  process.stdout.write(`${message}\n`)
}

function fail(message) {
  process.stderr.write(`\nError: ${message}\n`)
  process.exit(1)
}

function run(command, commandArgs, cwd, options = {}) {
  const label = [command, ...commandArgs].join(" ")
  log(`\n> ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
    encoding: "utf8",
  })
  if (result.status !== 0 && !options.allowFailure) {
    fail(`Command failed in ${cwd}: ${label}`)
  }
  return result
}

function commandExists(command) {
  const lookup = process.platform === "win32" ? "where" : "command"
  const lookupArgs = process.platform === "win32" ? [command] : ["-v", command]
  const result = spawnSync(lookup, lookupArgs, {
    shell: true,
    stdio: "ignore",
  })
  return result.status === 0
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10)
  if (Number.isNaN(major) || major < 20) {
    fail(`Node.js 20+ is required. Current version: ${process.version}`)
  }
}

function npmInstallAndBuild(cwd) {
  const packageLock = existsSync(join(cwd, "package-lock.json"))
  run("npm", [packageLock ? "ci" : "install"], cwd)
  run("npm", ["run", "build"], cwd)
}

async function writeMcpConfigSnippet() {
  const config = {
    mcpServers: {
      "browser-bridge": {
        command: "node",
        args: [resolve(mcpEntry)],
      },
    },
  }

  const outDir = join(root, ".browser-bridge")
  const outPath = join(outDir, "mcp-config.json")
  await mkdir(outDir, { recursive: true })
  await writeFile(outPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  return outPath
}

function installClaudeMcp() {
  if (skipClaude) return { skipped: true }
  if (!commandExists("claude")) return { missing: true }

  const result = run(
    "claude",
    ["mcp", "add", "browser-bridge", "node", resolve(mcpEntry)],
    root,
    { allowFailure: true, capture: true },
  )

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  }
}

async function main() {
  log("Browser Bridge installer")
  log("========================")

  assertNodeVersion()

  if (!existsSync(join(mcpDir, "package.json"))) {
    fail("mcp-server/package.json was not found. Run this installer from the Browser Bridge repo root.")
  }

  if (!skipBuild) {
    log("\nBuilding MCP server...")
    npmInstallAndBuild(mcpDir)

    log("\nBuilding Chrome extension...")
    npmInstallAndBuild(extensionDir)
  }

  if (!existsSync(mcpEntry)) {
    fail(`MCP server entry was not found: ${mcpEntry}`)
  }

  if (!existsSync(extensionBuild)) {
    fail(`Chrome extension build was not found: ${extensionBuild}`)
  }

  const configPath = await writeMcpConfigSnippet()
  const claude = installClaudeMcp()

  log("\nDone.")
  log("\nMCP server:")
  log(`  ${resolve(mcpEntry)}`)

  if (claude.skipped) {
    log("\nClaude Code registration skipped because --no-claude was provided.")
  } else if (claude.missing) {
    log("\nClaude Code CLI was not found, so automatic MCP registration was skipped.")
  } else if (claude.ok) {
    log("\nClaude Code MCP registration completed.")
  } else {
    log("\nClaude Code MCP registration did not complete automatically.")
    if (claude.output) log(`  ${claude.output}`)
  }

  log("\nFor other MCP clients, use this config snippet:")
  log(`  ${configPath}`)

  log("\nChrome extension:")
  log(`  1. Open chrome://extensions/`)
  log(`  2. Enable Developer mode`)
  log(`  3. Click Load unpacked`)
  log(`  4. Select: ${resolve(extensionBuild)}`)

  log("\nVerify after loading the extension:")
  log("  Ask your MCP client: Take a screenshot of my current browser tab.")
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
