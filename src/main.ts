const { app, BrowserWindow } = require('electron');
const { StartCastingServer } = require('./screenCast/server/index');
const ActionAvailableDevicesToCast = require("./mdns-service").default
//@ts-nocheck
// Start the casting server first
StartCastingServer().then(()=>{
    // Initialize Electron app when the casting server is ready
    // Define the createWindow function
    function createWindow() {
        // Create the browser window.
        const mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                webSecurity:false,
                contextIsolation: true,
                preload: __dirname + '/preload.js'
            }
        });
        
        // Load your HTML file.
        mainWindow.loadFile('index.html');
        
        mainWindow.webContents.on('did-finish-load', () => {
            const data = "This is data from the main process.";
            const fetchDevices = new ActionAvailableDevicesToCast(mainWindow)
            mainWindow.webContents.send('from-main', data);
        });
        
        // Open the DevTools.
        // mainWindow.webContents.openDevTools();
    }
    
    // Check if Electron app is ready before creating window
    if (app) {
        app.whenReady().then(createWindow);
    } else {
        console.error('Electron app is not initialized.');
    }
    
    // Quit when all windows are closed, except on macOS.
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    
    
})