const path = require('node:path')
const fs = require('node:fs/promises')

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  const outDir = buildResult?.outDir
  if (!outDir) return []

  const pkgPath = path.join(process.cwd(), 'package.json')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(pkgPath)
  const productName = pkg.productName || pkg.name || 'App'
  const artifactBase = String(productName).trim().replace(/\s+/g, '-')
  const version = pkg.version || '0.0.0'

  const src = path.join(outDir, 'win-unpacked')
  const dst = path.join(outDir, `${artifactBase}-${version}-win-unpacked`)

  if (!(await pathExists(src))) return []
  if (await pathExists(dst)) return []

  try {
    await fs.rename(src, dst)
  } catch {
    // ignore (locked, already moved, etc.)
  }

  return []
}
