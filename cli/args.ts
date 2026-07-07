// args.ts
// File: cli/args.ts
// Purpose: Tiny pure argv helpers for the CLI. No dependency, no I/O.

/**
 * Value of a `--name value` flag, or `--name=value`. Returns null when the flag
 * is absent or has no value. Pure.
 */
export function getFlag(args: string[], name: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === name) {
      const next = args[i + 1];
      return next !== undefined && !next.startsWith("--") ? next : null;
    }
    if (a.startsWith(`${name}=`)) {
      return a.slice(name.length + 1);
    }
  }
  return null;
}

/** Whether a boolean flag is present. Pure. */
export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}
