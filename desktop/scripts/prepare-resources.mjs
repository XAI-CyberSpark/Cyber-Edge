import { cp, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const studioRoot = path.join(repoRoot, 'studio')
const backendRoot = path.join(repoRoot, 'backend')
const frontendDist = path.join(studioRoot, 'dist')
const appDir = path.join(desktopRoot, 'app')
const frontendTarget = path.join(appDir, 'frontend')
const runtimeDir = path.join(desktopRoot, 'runtime')
const backendTarget = path.join(runtimeDir, 'backend')

await stat(frontendDist)

await rm(appDir, { recursive: true, force: true })
await rm(runtimeDir, { recursive: true, force: true })

await mkdir(frontendTarget, { recursive: true })
await mkdir(backendTarget, { recursive: true })

await cp(frontendDist, frontendTarget, { recursive: true })
await cp(path.join(backendRoot, 'app'), path.join(backendTarget, 'app'), {
  recursive: true,
  filter: (source) => !source.includes('__pycache__')
})
await cp(path.join(backendRoot, '.venv'), path.join(backendTarget, '.venv'), {
  recursive: true
})
await cp(path.join(backendRoot, 'main.py'), path.join(backendTarget, 'main.py'))
await cp(path.join(backendRoot, 'requirements.txt'), path.join(backendTarget, 'requirements.txt'))
