const { app } = require('electron');
const os = require('os');
const adb = require('adbkit');
const { spawn, exec } = require('child_process');
const path = require('path');
const log = require('electron-log');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');

export const getAdbPath = () => {
  const adbDirectory = "/Users/mohammedumer/Library/Application Support/inspirit-config-center/adb/darwin"
  if (!fs.existsSync(adbDirectory)) {
    fs.mkdirSync(adbDirectory, { recursive: true });
  }
  let adbExecutable = 'adb';
  if (os.platform() === 'win32') {
    adbExecutable = 'adb.exe';
  }
  return path.join(adbDirectory, adbExecutable);
};

export const client = adb.createClient({
  host: '127.0.0.1',
  bin: getAdbPath(),
});

export const getListOfConnectedDevices = async () => {
  try {
    log.info('Getting list of connected devices');
    const usbDevices = await client.listDevices();
    log.info(`Found ${usbDevices.length} connected devices`);
    return usbDevices;
  } catch (err) {
    return [];
  }
};

export const authorizeDevice = async (
  deviceSerial: string,
  osVersion: string
) => {
  if (!deviceSerial) {
    log.error('No device serial provided for authorization');
    return false;
  }

  log.info(`Authorizing device with serial: ${deviceSerial}`);

  try {
    log.info(`Granting WRITE_SECURE_SETTINGS permission to ${deviceSerial}`);
    await client.shell(
      deviceSerial,
      'pm grant inspiritvr.wirelessadb android.permission.WRITE_SECURE_SETTINGS'
    );

    log.info(`Granting READ_LOGS permission to ${deviceSerial}`);
    await client.shell(
      deviceSerial,
      'pm grant inspiritvr.wirelessadb android.permission.READ_LOGS'
    );

    log.info(`Starting inspiritvr.wirelessadb on ${deviceSerial}`);
    await client.shell(deviceSerial, 'monkey -p inspiritvr.wirelessadb 1');

    if (Number(osVersion) <= 10) {
      log.info(
        `OS version is ${osVersion}, initiating TCP/IP connection for ${deviceSerial}`
      );
      const isTcpConnected = await tcpIpConnect(deviceSerial);
      if (!isTcpConnected) {
        log.error(`Failed to establish TCP/IP connection with ${deviceSerial}`);
        return false;
      }
    }

    log.info(`Successfully authorized ${deviceSerial}`);
    return true;
  } catch (err: any) {
    log.error(
      `Error authorizing device ${deviceSerial}: ${err.message || err}`
    );
    return false;
  }
};

export const tcpIpConnect = async (deviceSerial: string) => {
  try {
    await client.tcpip(deviceSerial);
    return true;
  } catch (err) {
    log.error(`Error connecting to TCP/IP: ${err}`);
    return false;
  }
};

export const connect = async (args: any) => {
  const { ip, port, forwardedDeviceName } = args;
  log.info(`Connecting to ADB at ${ip}:${port}`);

  try {
    await client.connect(ip, port);
    log.info(`Connected to ADB at ${ip}:${port}`);
    return {
      statusCode: 200,
      message: 'OK',
      data: { ip, port, forwardedDeviceName },
    };
  } catch (error: any) {
    log.error(`Failed to connect to ADB at ${ip}:${port}: ${error}`);
    throw {
      statusCode: 99,
      message: 'Could not connect to ADB',
      data: { ip, port, forwardedDeviceName },
    };
  }
};

/**
 * Starts the ADB server. This is required before any ADB commands can be run or before adbkit can be used.
 * @returns A promise that resolves when the ADB server is started successfully, or rejects with an error if the server fails to start.
 */
export const startAdbServer = () => {
  log.info('Starting ADB server...');
  return new Promise((resolve, reject) => {
    const adbProcess = spawn(getAdbPath(), ['start-server']);

    adbProcess.stdout.on('data', (data: Buffer) => {
      log.info(`ADB: ${data}`);
    });

    adbProcess.stderr.on('data', (data: Buffer) => {
      log.error(`ADB: ${data}`);
    });

    adbProcess.on('close', (code: number) => {
      if (code !== 0) {
        log.error(`Failed to start ADB server (code ${code})`);
        reject(new Error('Failed to start ADB server'));
      } else {
        log.info('ADB server started successfully');
        resolve();
      }
    });
  });
};

/**
 * Checks the connected devices using adb. If the server is not running, it will start the daemon.
 */
export const checkConnectedDevices = () => {
  log.info('Checking connected devices...');
  exec(
    `"${getAdbPath()}" devices`,
    (err: Error, stdout: string, stderr: string) => {
      if (err) {
        log.error(`Error running adb devices: ${err}`);
        return;
      }
      if (stderr) {
        log.error(`Error running adb devices: ${stderr}`);
        return;
      }
      log.info(`Connected devices: ${stdout}`);
    }
  );
};

export const checkAdbExists = () => {
  if (!fs.existsSync(getAdbPath())) {
    downloadADB();
  } else {
    log.info('ADB exists at path:', getAdbPath());
  }
};

export const downloadADB = () => {
  const adbZipPath = path.join(
    app.getPath('appData'),
    app.getName(),
    'adb.zip'
  );
  const adbUrl =
    os.platform() === 'darwin'
      ? 'https://config-center-binaries.s3.amazonaws.com/mac-adb.zip'
      : 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

  log.info('Downloading ADB from:', adbUrl);
  https
    .get(adbUrl, (response: any) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(adbZipPath);
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          log.info('ADB ZIP downloaded successfully');
          extractADB(adbZipPath, path.dirname(getAdbPath()));
        });
      } else {
        log.error(
          `Failed to download ADB: Server responded with status code ${response.statusCode}`
        );
        response.resume(); // Consume response data to free up memory
      }
    })
    .on('error', (err: any) => {
      log.error('Failed to download ADB:', err);
    });
};

const extractADB = (zipPath: string, extractToPath: string) => {
  log.info(`Extracting ADB from ${zipPath} to ${extractToPath}`);
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractToPath, true);
    log.info('ADB extracted successfully');
    if (os.platform() === 'win32') {
      const platformToolsPath = path.join(extractToPath, 'platform-tools');
      const filesToMove = fs.readdirSync(platformToolsPath);

      // Move each file and directory inside 'platform-tools' to the extracted folder
      filesToMove.forEach((item) => {
        const sourcePath = path.join(platformToolsPath, item);
        const destinationPath = path.join(extractToPath, item);

        // Move the file or directory using fs.renameSync
        fs.renameSync(sourcePath, destinationPath);
      });

      // Remove the now-empty 'platform-tools' directory
      fs.rmdirSync(platformToolsPath);
      log.info(`Moved contents from 'platform-tools' to '${extractToPath}'`);
    }
    makeExecutable(getAdbPath());
    fs.unlinkSync(zipPath); // Clean up the ZIP file after extraction
  } catch (err) {
    log.error('Failed to extract ADB:', err);
  }
};

const makeExecutable = (adbPath: string) => {
  if (os.platform() !== 'win32') {
    fs.chmod(adbPath, 0o755, (err: any) => {
      if (err) {
        log.error('Failed to make ADB executable:', err);
      } else {
        log.info('ADB is now executable');
      }
    });
  }
};

// const disconnect = (ip) => {
//   client
//     .disconnect(ip)
//     .then((id) => {
//       debug(id);
//       console.log('connect', {
//         success: false,
//         message: 'Device shutdown succeeded',
//       });
//     })
//     .catch((err) => {
//       debug(err);
//       console.log('connect', {
//         success: false,
//         message: 'Device shutdown failed',
//       });
//     });
// };

// const captureScreen = (deviceId) => {
//   const streamingUrl = `rtmp://localhost/live/ADBSCRCPY`;

//   const adbCommand = `adb -s ${deviceId} shell screenrecord --output-format=h264 - | ffmpeg -re -i - -c:v libx264 -b:v 1M -preset ultrafast -tune zerolatency -f flv ${streamingUrl}`;

//   const adbProcess = exec(adbCommand);

//   adbProcess.stdout.on('data', (data) => {
//     console.log(data.toString());
//   });

//   adbProcess.stderr.on('data', (data) => {
//     console.error(data.toString());
//   });

//   adbProcess.on('exit', (code) => {
//     console.log(`ADB process exited with code ${code}`);
//   });
// };
