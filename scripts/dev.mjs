import { spawn } from 'node:child_process'

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const children = new Set()
let shuttingDown = false

function start(name, args) {
  const child = spawn(pnpmBin, args, {
    stdio: 'inherit',
    env: process.env,
  })

  children.add(child)

  child.on('exit', (code, signal) => {
    children.delete(child)

    if (shuttingDown) {
      return
    }

    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[dev] ${name} exited with ${detail}, shutting down the remaining processes.`)
    shutdown(code ?? 0)
  })

  child.on('error', (error) => {
    if (shuttingDown) {
      return
    }

    console.error(`[dev] failed to start ${name}:`, error)
    shutdown(1)
  })
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of children) {
    child.kill('SIGTERM')
  }

  setTimeout(() => {
    process.exit(exitCode)
  }, 50)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('signal', ['dev:signal'])
start('web', ['dev:web'])
