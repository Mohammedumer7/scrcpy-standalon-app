// @ts-nocheck
import Adb from '@dead50f7/adbkit/lib/adb';
import { ExtendedClient } from './ExtendedClient';
import { ClientOptions } from '@dead50f7/adbkit/lib/ClientOptions';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { getAdbPath } from '../../../../library/adb'
//ts-ignore
interface Options{
//ts-ignore 
    host?: string;
    //ts-ignore
    port?: number;
    //ts-ignore
    bin?: string;
}

export class AdbExtended extends Adb {
  // property to store the path to the adb binary
  public static adbPath = '';

  static createClient(options: Options = {}): ExtendedClient {
    log.info('Screencast: Creating ADB client');
    const opts: ClientOptions = {
      bin: options.bin,
      host: options.host || process.env.ADB_HOST || '127.0.0.1',
      port: options.port || 0,
    };

    log.info('Screencast: ADB path not provided, using default path');
    opts.bin = getAdbPath();

    if (!opts.port) {
      const port = parseInt(process.env.ADB_PORT || '', 10);
      if (!isNaN(port)) {
        opts.port = port;
      } else {
        opts.port = 5037;
      }
    }
    return new ExtendedClient(opts);
  }
}
