const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn } = require('child_process')

const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = 8000
const BACKEND_HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`

// Reuse the previous desktop data location on upgrades.
const currentData = app.getPath('userData')
if (!fs.existsSync(currentData)) {
  for (const name of ['CyberEdge Studio Desktop', 'cyberedge-studio-desktop']) {
    const legacyData = path.join(app.getPath('appData'), name)
    if (fs.existsSync(legacyData)) { app.setPath('userData', legacyData); break }
  }
}

let backendProcess = null

const appRoot = () => app.getAppPath()
const packagedBackendRoot = () => path.join(process.resourcesPath, 'backend')
const devBackendRoot = () => path.resolve(__dirname, '..', 'backend')

const getBackendRoot = () => (app.isPackaged ? packagedBackendRoot() : devBackendRoot())

const getFrontendEntry = () => path.join(appRoot(), 'app', 'frontend', 'index.html')

const getBackendPython = () => path.join(getBackendRoot(), '.venv', 'bin', 'python')

const getBackendLogPath = () => {
  const logDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  return path.join(logDir, 'backend.log')
}

const writeBackendLog = (stream) => {
  const logPath = getBackendLogPath()
  const target = fs.createWriteStream(logPath, { flags: 'a' })
  stream.pipe(target)
}

const waitForBackend = (attempt = 0) =>
  new Promise((resolve, reject) => {
    const request = http.get(BACKEND_HEALTH_URL, (response) => {
      response.resume()
      if (response.statusCode === 200) {
        resolve(true)
        return
      }

      if (attempt >= 39) {
        reject(new Error(`Backend health check failed with status ${response.statusCode}`))
        return
      }

      setTimeout(() => {
        waitForBackend(attempt + 1).then(resolve).catch(reject)
      }, 500)
    })

    request.on('error', () => {
      if (attempt >= 39) {
        reject(new Error('Backend did not start in time'))
        return
      }

      setTimeout(() => {
        waitForBackend(attempt + 1).then(resolve).catch(reject)
      }, 500)
    })
  })

const startBackend = () => {
  if (backendProcess) {
    return
  }

  const backendRoot = getBackendRoot()
  const pythonPath = getBackendPython()
  const userDataDir = path.join(app.getPath('userData'), 'backend-data')
  fs.mkdirSync(userDataDir, { recursive: true })

  backendProcess = spawn(
    pythonPath,
    ['-m', 'uvicorn', 'main:app', '--host', BACKEND_HOST, '--port', String(BACKEND_PORT)],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        CHROMA_DB_PATH: path.join(userDataDir, 'chromadb'),
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  if (backendProcess.stdout) {
    writeBackendLog(backendProcess.stdout)
  }

  if (backendProcess.stderr) {
    writeBackendLog(backendProcess.stderr)
  }

  backendProcess.on('exit', () => {
    backendProcess = null
  })
}

const stopBackend = () => {
  if (!backendProcess) {
    return
  }

  backendProcess.kill('SIGTERM')
  backendProcess = null
}

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  await win.loadFile(path.join(__dirname, 'app-loading.html'))

  try {
    startBackend()
    await waitForBackend()
    await win.loadFile(getFrontendEntry())
    win.show()
  } catch (error) {
    dialog.showErrorBox('OAKEgde Studio Desktop', error instanceof Error ? error.message : 'Backend failed to start')
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<html><body style="background:#020617;color:#e2e8f0;font-family:sans-serif;padding:24px"><h2>OAKEgde Studio Desktop</h2><p>Backend failed to start. Please check logs in the application data directory.</p></body></html>')}`)
    win.show()
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', stopBackend)

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow()
  }
})
