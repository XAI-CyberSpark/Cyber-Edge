const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('oakegdeDesktop', {
  platform: process.platform
})
