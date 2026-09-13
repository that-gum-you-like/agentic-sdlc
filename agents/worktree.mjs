#!/usr/bin/env node
/**
 * worktree.mjs — one git worktree per agent, so parallel agents cannot
 * corrupt each other's index.
 *
 * WHY THIS EXISTS. On 2026-09-13 two agents worked in one checkout of
 * ~/nels-workshop. One of them created a branch and checked it out; the other
 * committed believing it was on `main`, ran `git push origin main`, and got
 * "Everything up-to-date" — the commit had landed on the first agent's branch,
 * which then committed on top of it. Nothing was lost, but only because git
 * refused a `checkout` that would have clobbered a third file. `git add -A` in
 * a shared checkout stages whatever the other agent has half-written.
 *
 * A worktree gives each agent its own directory, its own HEAD and its own
 * index, against one shared object store. `git add -A` becomes safe again,
 * which matters because it is what agents reach for.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not merge for you. Landing work is
 * `land`, which runs the gates in a scratch worktree at the base branch and
 * refuses on red — the pattern agents/pr-auto-review.mjs already uses.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };

/** Shared between worktrees on purpose; NEVER `.next`, which is why a stale
 *  build served one agent's client components against another's server. */
const SHARED = ["node_modules", ".env.local", ".env"];

function repoRoot(from = process.cwd()) {
  const root = tryGit(from, "rev-parse", "--show-toplevel");
  if (!root) { console.error("Not inside a git repository."); process.exit(2); }
  // A worktree's toplevel is itself; resolve to the main checkout.
  const common = tryGit(from, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return common && common.endsWith("/.git") ? dirname(common) : root;
}

function worktreeDir(root, slug) {
  return join(dirname(root), `${basename(root)}-wt`, slug);
}

function create(root, slug, base) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`Slug must be kebab-case: got "${slug}"`); process.exit(2);
  }
  const dir = worktreeDir(root, slug);
  const branch = `agent/${slug}`;
  if (existsSync(dir)) { console.error(`Already exists: ${dir}`); process.exit(2); }

  mkdirSync(dirname(dir), { recursive: true });
  const exists = tryGit(root, "rev-parse", "--verify", branch);
  git(root, "worktree", "add", ...(exists ? [] : ["-b", branch]), dir, ...(exists ? [branch] : [base]));

  // Symlink rather than copy: one install, and an agent editing a dependency
  // is a problem you want to find immediately rather than in one worktree.
  for (const name of SHARED) {
    const src = join(root, name);
    if (existsSync(src) && !existsSync(join(dir, name))) {
      try { symlinkSync(src, join(dir, name)); } catch { /* best effort */ }
    }
  }

  console.log(`\n  ${dir}`);
  console.log(`  branch ${branch}, from ${base}\n`);
  console.log("  Give the agent that path and this line:");
  console.log(`    cd ${dir}   — your own checkout. \`git add -A\` is safe here.`);
  console.log(`    Do not touch ${root}; another agent may be in it.\n`);
}

function list(root) {
  const raw = git(root, "worktree", "list", "--porcelain");
  const blocks = raw.split("\n\n").filter(Boolean);
  console.log();
  for (const block of blocks) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch (.+)$/m.exec(block)?.[1]?.replace("refs/heads/", "") ?? "(detached)";
    if (!path) continue;
    const dirty = (tryGit(path, "status", "--porcelain") ?? "").split("\n").filter(Boolean).length;
    const ahead = tryGit(path, "rev-list", "--count", `main..HEAD`) ?? "?";
    const mark = path === root ? "  (shared)" : "";
    console.log(`  ${branch.padEnd(34)} ${String(dirty).padStart(3)} changed  ${String(ahead).padStart(3)} ahead${mark}`);
    console.log(`    ${path}`);
  }
  console.log();
}

function land(root, slug, base, { dryRun }) {
  const dir = worktreeDir(root, slug);
  if (!existsSync(dir)) { console.error(`No worktree for "${slug}"`); process.exit(2); }
  const branch = `agent/${slug}`;

  const dirty = git(dir, "status", "--porcelain");
  if (dirty) {
    console.error(`\n  ${branch} has uncommitted changes. Commit them first:\n`);
    console.error(dirty.split("\n").map((l) => `    ${l}`).join("\n"));
    process.exit(1);
  }
  const commits = git(root, "rev-list", "--count", `${base}..${branch}`);
  if (commits === "0") { console.log(`\n  ${branch} has nothing to land.\n`); return; }

  console.log(`\n  ${branch}: ${commits} commit(s) to land on ${base}\n`);
  console.log(git(root, "log", "--oneline", `${base}..${branch}`).split("\n").map((l) => `    ${l}`).join("\n"));

  // The gates run in a scratch worktree at the base with the branch merged in,
  // never in anybody's live checkout. Same shape as pr-auto-review.mjs.
  const scratch = join(dirname(dir), `.land-${slug}`);
  rmSync(scratch, { recursive: true, force: true });
  git(root, "worktree", "add", "--detach", scratch, base);
  try {
    for (const name of SHARED) {
      const src = join(root, name);
      if (existsSync(src)) { try { symlinkSync(src, join(scratch, name)); } catch { /* */ } }
    }
    git(scratch, "merge", "--no-ff", "--no-edit", branch);
    console.log("\n  merged cleanly into a scratch checkout. Running the gates.\n");

    /**
     * THREE GATES, AND THE THIRD IS NOT REDUNDANT.
     *
     * On 2026-09-13 a rename landed in `lib/prototypes/data.ts` and not in its
     * one caller. ALL 1,927 TESTS PASSED. `tsc` failed and the production
     * build failed outright, and main shipped broken for forty minutes because
     * neither was run against it in isolation — the shared checkout still held
     * the missing file uncommitted, so everything compiled locally.
     *
     * The tests could not see it, and they never will: a type error between a
     * module and its caller is invisible to a suite that mocks or never
     * renders that page. `tsc` catches the signature; the build catches what
     * `tsc` cannot — client/server boundary violations, a missing "use
     * client", an unserialisable prop, a route exporting the wrong shape.
     * Different instruments, different failures.
     *
     * The build is skipped only when the project has no build script, so this
     * stays useful in a library or a scripts repo.
     */
    const pkgPath = join(scratch, "package.json");
    const hasBuild = existsSync(pkgPath)
      && Boolean(JSON.parse(readFileSync(pkgPath, "utf8")).scripts?.build);
    if (!hasBuild) console.log("    build … skipped (no build script)");

    for (const [label, cmd, args] of [
      ["tsc", "npx", ["tsc", "--noEmit"]],
      ["vitest", "npx", ["vitest", "run"]],
      ...(hasBuild ? [["build", "npm", ["run", "build"]]] : []),
    ]) {
      process.stdout.write(`    ${label} … `);
      try {
        execFileSync(cmd, args, { cwd: scratch, stdio: "pipe", timeout: 30 * 60_000 });
        console.log("pass");
      } catch {
        console.log("FAIL");
        console.error(`\n  ${label} failed on the merge result. Not landed.\n`);
        process.exit(1);
      }
    }
    if (dryRun) { console.log("\n  --dry-run: gates pass; nothing pushed.\n"); return; }
    git(scratch, "push", "origin", `HEAD:${base}`);
    console.log(`\n  pushed to ${base}.\n`);
  } finally {
    try { git(root, "worktree", "remove", "--force", scratch); } catch { /* */ }
  }
}

function remove(root, slug) {
  const dir = worktreeDir(root, slug);
  const dirty = existsSync(dir) ? git(dir, "status", "--porcelain") : "";
  if (dirty) { console.error(`\n  ${dir} has uncommitted changes. Refusing.\n`); process.exit(1); }
  git(root, "worktree", "remove", "--force", dir);
  git(root, "worktree", "prune");
  console.log(`\n  removed ${dir}\n`);
}

function __isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

function main() {
  const [cmd, slug] = process.argv.slice(2);
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith("--base="))?.slice(7) ?? "main";
  const dryRun = args.includes("--dry-run");
  const root = repoRoot();

  switch (cmd) {
    case "create": if (!slug) { console.error("usage: worktree.mjs create <slug> [--base=main]"); process.exit(2); }
      return create(root, slug, base);
    case "list":   return list(root);
    case "land":   if (!slug) { console.error("usage: worktree.mjs land <slug> [--base=main] [--dry-run]"); process.exit(2); }
      return land(root, slug, base, { dryRun });
    case "remove": if (!slug) { console.error("usage: worktree.mjs remove <slug>"); process.exit(2); }
      return remove(root, slug);
    default:
      console.log(`
  worktree.mjs — one checkout per agent

    create <slug> [--base=main]   a worktree at <repo>-wt/<slug> on agent/<slug>
    list                          every worktree, its branch, dirt and distance
    land   <slug> [--dry-run]     gates in a scratch checkout, then push
    remove <slug>                 refuses if the worktree is dirty

  Run from anywhere inside the repository.
`);
      process.exit(cmd ? 2 : 0);
  }
}

if (__isMainModule()) main();

export { create, list, land, remove, worktreeDir };
