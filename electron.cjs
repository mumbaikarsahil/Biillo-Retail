const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Required for preload script
      // LINK THE BRIDGE HERE:
      preload: path.join(__dirname, 'preload.cjs'), 
    },
    autoHideMenuBar: true,
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  // --- NEW: HANDLE PRINTER REQUESTS ---

  // 1. Get List of Printers
  ipcMain.handle('get-printers', async () => {
    return mainWindow.webContents.getPrintersAsync();
  });

  // 2. Print Silently
  ipcMain.handle('print-component', async (event, htmlContent, printerName) => {
    // Create a hidden window to render the HTML
    const printWindow = new BrowserWindow({ show: false, width: 800, height: 600 });
    
    // Load the receipt HTML
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    // Print options
    const options = {
      silent: true,
      deviceName: printerName, // The specific printer selected in React
    };

    // Execute Print
    try {
      await printWindow.webContents.print(options);
      printWindow.close();
      return { success: true };
    } catch (error) {
      printWindow.close();
      console.error("Print Failed:", error);
      throw error;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});