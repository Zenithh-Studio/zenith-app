import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const [tool, ...providedArguments] = process.argv.slice(2)

if (tool !== 'next' && tool !== 'payload') {
  throw new Error('Expected a supported CLI: next or payload.')
}

const entryPoint =
  tool === 'next'
    ? require.resolve('next/dist/bin/next')
    : path.resolve(path.dirname(require.resolve('payload')), '../bin.js')
const argumentsForCli = [...providedArguments]

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' ')

if (tool === 'next' && ['dev', 'start'].includes(argumentsForCli[0])) {
  process.env.PORT ||= '3000'
  argumentsForCli.push('--port', process.env.PORT, '--hostname', '0.0.0.0')
}

const child = spawn(process.execPath, [entryPoint, ...argumentsForCli], {
  env: process.env,
  stdio: 'inherit',
})

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
