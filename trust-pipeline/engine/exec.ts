import { spawn } from 'node:child_process'

export type ExecResult = { ok: boolean; output: string }

/** Runs a shell command, capturing stdout + stderr regardless of exit code. */
export function exec(
  command: string,
  cwd: string = process.cwd(),
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    child.on('error', (error) => {
      resolve({ ok: false, output: `${output}${error.message}` })
    })
    child.on('close', (code) => {
      resolve({ ok: code === 0, output })
    })
  })
}
