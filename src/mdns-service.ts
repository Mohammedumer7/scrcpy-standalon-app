//@ts-nocheck
import Electron, { ipcMain } from "electron";
import log from "electron-log/main";

import DeviceDiscovery from "multicast-device-discovery";
import {
  startAdbServer,
  checkConnectedDevices,
  connect,
  getListOfConnectedDevices,
  authorizeDevice,
  tcpIpConnect,
  client,
} from "./library/adb";
import { cast } from "./screenCast/app";
class ActionAvailableDevicesToCast {
  private mainwindow: any;
  private adbConnectedDevices: any;
  private extractdeviceData(device: any) {
    const ip = device.referer.address;
    const id = device.name.split("-")[1];
    const checkForwarded = device.name.split(" ");
    const forwardedDeviceName = checkForwarded[0];
    const name = device.name.split("-")[0];
    const port = device.port;
    return { ip, id, checkForwarded, forwardedDeviceName, name, port };
  }
  constructor(window: any) {
    this.mainwindow = window;
    this.adbConnectedDevices = {};
    this.currentlyStreamingDevices = {};
    this.setup();
  }
  private async fetchAvailableDevicesToCast() {
    this.deviceDiscovery.on("Update", (devices: any) => {
      log.info("Received device update event:", devices);
      const connectedDevices: any[] = [];
      const readyToCast: any[] = [];
      try {
        devices?.devices.forEach((device: any) => {
          const { ip, id, checkForwarded, forwardedDeviceName, name, port } =
            this.extractdeviceData(device);
          console.log(this.adbConnectedDevices, forwardedDeviceName);
          if (checkForwarded.length > 1) {
            this.adbConnectedDevices[forwardedDeviceName] = device;
          }
          connectedDevices.push(
            connect({ ip, name, port, id, forwardedDeviceName })
          );
        });

        this.adbConnectedDevices &&
          Object.keys(this.adbConnectedDevices)?.forEach((key) => {
            const { ip, id, forwardedDeviceName, name, port } =
              this.extractdeviceData(this.adbConnectedDevices[key]);
            connectedDevices.push(
              connect({ ip, name, port, id, forwardedDeviceName })
            );
          });
        console.log("connected devices", connectedDevices);
        Promise.allSettled(connectedDevices)
          .then((results) => {
            log.info("Connected devices:", results);
            results.forEach((result) => {
              if (result.status === "fulfilled") {
                const { ip, port, forwardedDeviceName } = result.value.data;
                if (ip && port) {
                  const deviceIdx = devices.devices.findIndex(
                    (device: any) => device.port === port
                  );
                  const readyToCastIdx = readyToCast.findIndex(
                    (castDevice) => castDevice.port === port
                  );
                  if (readyToCastIdx === -1) {
                    if (deviceIdx !== -1) {
                      devices.devices[deviceIdx].name =
                        devices.devices[deviceIdx].name.split(" ")[0];
                      const deviceData = devices.devices[deviceIdx];
                      readyToCast.push(deviceData);
                    } else if (this.adbConnectedDevices[forwardedDeviceName]) {
                      readyToCast.push(
                        this.adbConnectedDevices[forwardedDeviceName]
                      );
                    }
                  }
                }
              }
            });
            // Send the devices that successfully connected
            readyToCast.forEach((device) => {
              const ip = device.referer.address;
              this.currentlyStreamingDevices[ip] = device;
            });
            console.log("readyToCast", readyToCast);
            if (readyToCast.length > 0) {
              const { port } = readyToCast[0];
              const ip = readyToCast[0].referer.address;
              // cast(ip, port, "asdsaa", "adasad", "adssad");
              this.mainwindow.webContents.send("cast", {
                ip,
                port,
                deviceName: "deviceName",
                serial: "serial",
                eventEmitter: "sddf",
              });
              // cast(ip,
              //     port,
              //     "deviceName",
              //     "serial",
              //     "sddf")
            }
            console.log(readyToCast);
          })
          .catch((error) => {
            log.error("Error connecting to devices:", error);
            console.log("Error connecting to devices:", error);
          });
      } catch (error) {
        console.log("Error while device connection", error);
      }

      return null;
    });

    this.deviceDiscovery.on("Device Discovery Error", (error: any) => {
      console.log("Error in Device Discovery", error);
    });
    this.deviceDiscovery.startDeviceDiscovery();
  }

  setupDeviceDiscovery() {
    if (!this.deviceDiscovery && !this.initialised) {
      const options = {
        deviceTimeoutThreshold: 3000,
        serviceType: "adb-tls-connect",
      };
      this.deviceDiscovery = new DeviceDiscovery(options);
    }
    this.fetchAvailableDevicesToCast();
    this.initialised = true;
  }
  async startStreaming(args: any) {
    log.info("Starting streaming:", args);
    try {
      const { ip, name, port, id, forwardedDeviceName } = args;
      await connect({
        ip,
        name,
        port,
        id,
        forwardedDeviceName,
      });
      return true;
    } catch (err) {
      log.error(`Error starting streaming: ${err}`);
      return false;
    }
  }

  async getUsbConnectedDevices() {
    try {
      const usbDevices = await getListOfConnectedDevices();
      return usbDevices;
    } catch (err) {
      console.log(err);
      return [];
    }
  }

  async authorizeDevice(args: any) {
    try {
      const { deviceSerial, osVersion } = args;
      const usbDevices = await authorizeDevice(deviceSerial, osVersion);
      return usbDevices;
    } catch (err) {
      console.log(err);
      return [];
    }
  }

  async tcpConnect(args: any) {
    try {
      const { deviceSerial } = args;
      console.log(deviceSerial);
      const usbDevices = await tcpIpConnect(deviceSerial);
      return usbDevices;
    } catch (err) {
      console.log(err);
      return [];
    }
  }

  async isDeviceConnected(args: any) {
    try {
      const { deviceSerial } = args;
      const usbDevices = await client.listDevices();
      // if the deviceserial is found in the list of connected devices, return true
      return usbDevices.some((device: any) => device.id === deviceSerial);
    } catch (err) {
      console.log(err);
      return false;
    }
  }

  async setup() {
    this.setupDeviceDiscovery();
  }

  cleanUp() {
    if (this.deviceDiscovery) {
      this.deviceDiscovery.cleanup();
      this.deviceDiscovery = null;
      this.initialised = false;
    }
  }

  destroy() {
    if (this.deviceDiscovery) {
      this.deviceDiscovery.cleanup();
      this.deviceDiscovery = null;
      ipcMain.removeAllListeners(ActionAvailableDevicesToCast.CHANNEL_NAME);
    }
  }
}

export default ActionAvailableDevicesToCast;
