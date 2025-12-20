const { spawn } = require('node:child_process')
const path = require('node:path')

function getElectronBuilderBin() {
  const bin = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
  return path.join(process.cwd(), 'node_modules', '.bin', bin)
}

function run(bin, args) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const quoteArg = (a) => (/[ \t"]/g.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)

    // On Windows, electron-builder is a .cmd shim and this repo path contains spaces.
    // Use cmd.exe /c with explicit quoting so it runs reliably.
    const child = isWin
      ? spawn(
        'cmd.exe',
        // Use an outer pair of quotes for /c, and an inner pair to quote the .cmd path.
        // This avoids issues with spaces in the repo path ("typing-trainer react-ts").
        ['/d', '/s', '/c', `""${bin}" ${args.map(quoteArg).join(' ')}"`],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: true },
      )
      : spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (buf) => {
      const s = buf.toString('utf8')
      out += s
      process.stdout.write(s)
    })
    child.stderr.on('data', (buf) => {
      const s = buf.toString('utf8')
      err += s
      process.stderr.write(s)
    })
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }))
  })
}

function looksLikeWindowsFileLock(logText) {
  const t = logText.toLowerCase()
  return (
    (t.includes('app.asar') && t.includes('being used by another process'))
    || (t.includes('app.asar') && t.includes('cannot access the file'))
    || (t.includes('app.asar') && t.includes('process cannot access the file'))
    || (t.includes('app.asar') && t.includes('another process'))
    || (t.includes('app.asar') && t.includes('另一进程'))
    || (t.includes('app.asar') && t.includes('正由另一进程使用'))
  )
}

async function main() {
  const bin = getElectronBuilderBin()
  const baseArgs = ['--publish', 'never']

  const first = await run(bin, baseArgs)
  if (first.code === 0) process.exit(0)

  const combined = `${first.out}\n${first.err}`
  if (!looksLikeWindowsFileLock(combined)) {
    process.exit(first.code)
  }

  // Windows sometimes keeps the previous output folder locked (Defender scanning, Explorer preview, etc.).
  // Fall back to a fresh output directory so packaging can proceed.
  const pkg = require(path.join(process.cwd(), 'package.json'))
  const version = pkg.version || '0.0.0'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fallbackOutDir = `release/CodeTyping-Trainer-${version}-local-${stamp}`

  console.warn(`\n[build] Detected locked app.asar; retrying with output=${fallbackOutDir}\n`)

  const second = await run(bin, [...baseArgs, `--config.directories.output=${fallbackOutDir}`])
  process.exit(second.code)
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
