import * as http from 'http';
import express from 'express';
import * as WS_MODULE from 'ws';
import uuidv4 from './uuidv4';
import ByteToInt16 from './ByteToInt16';

class StreamServer {
  public isRunning: boolean = false;

  private app;

  public port;

  public server: any;

  // eslint-disable-next-line no-use-before-define
  static instance: StreamServer;

  public static getInstance(port: number): StreamServer {
    if (!StreamServer.instance) {
      StreamServer.instance = new StreamServer(port);
    }

    return StreamServer.instance;
  }

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
  }

  start() {
    if (this.isRunning) return;
    const { port } = this;

    const ws = new WS_MODULE.Server({ server: this.server });

    this.server.listen(port, () => {
      console.log(`Server turned on, port number:${port}`);
    });

    this.isRunning = true;

    let serverID = 'undefined';
    let serverWS = null as any;
    const clients = new Map();

    ws.on('connection', function connection(socket: any) {
      const wsid = uuidv4();
      const networkType = 'undefined';
      const metadata = { socket, networkType, wsid };

      if (!clients.has(wsid)) {
        socket.id = wsid;

        clients.set(wsid, metadata);
        console.log(`connection count: ${clients.size} : ${wsid}`);

        socket.send(`OnReceivedWSIDEvent(${wsid})`);
      }

      function heartbeat() {
        if (!socket) return;
        if (socket.readyState !== 1) return;
        if (serverID !== 'undefined') {
          socket.send('heartbeat');
        } else {
          socket.send('WaitingUnityServer');
        }
        setTimeout(heartbeat, 500);
      }

      // onOpen
      heartbeat();

      socket.on('close', function close() {
        // on user disconnected
        if (wsid === serverID) {
          // on server disconnected

          serverID = 'undefined';
          serverWS = null;
          console.log(`Disconnected [Server]: ${wsid}`);

          for (let i = clients.size - 1; i >= 0; i--) {
            const clientWSID = [...clients][i][0];
            if (clientWSID !== serverID) {
              [...clients][i][1].ws.send(`OnLostServerEvent(${wsid})`);
              [...clients][i][1].ws.close();
              clients.delete([...clients][i][0]);
            }
          }
        } else {
          // on client disconnected
          console.log(`Disconnected [Client]: ${wsid}`);
          if (serverWS !== null)
            serverWS.send(`OnClientDisconnectedEvent(${wsid})`);
        }

        clients.delete(wsid);
        console.log(`connection count: ${clients.size}`);
      });

      socket.on('message', function incoming(message: any) {
        const decodeString = new String(message);
        console.log(decodeString);

        // check registration
        if (message.length === 4) {
          if (
            message[0] === 0 &&
            message[1] === 0 &&
            message[2] === 9 &&
            message[3] === 3
          ) {
            serverID = wsid;
            serverWS = ws;
            console.log(`regServer: ${wsid}[Server] ${serverID}`);
            clients.get(wsid).networkType = 'server';

            for (let i = 0; i < clients.size; i++) {
              var clientWSID = [...clients][i][0];
              if (clientWSID !== wsid) {
                [...clients][i][1].ws.send(`OnFoundServerEvent(${wsid})`);
              }
              if (clientWSID !== serverID)
                serverWS.send(`OnClientConnectedEvent(${clientWSID})`);
            }
          } else if (
            message[0] === 0 &&
            message[1] === 0 &&
            message[2] === 9 &&
            message[3] === 4
          ) {
            console.log(`regClient: ${wsid}[Server] ${serverID}`);
            clients.get(wsid).networkType = 'client';

            if (serverWS !== null) {
              // tell server about the new connected client
              serverWS.send(`OnClientConnectedEvent(${wsid})`);

              // tell client about the existing server
              socket.send(`OnFoundServerEvent(${serverID})`);
            }
          }
        }

        // if(message.length > 4 && message[0] === 0)
        if (message.length > 4) {
          if (serverID !== 'undefined') {
            switch (message[1]) {
              // emit type: all;
              case 0:
                for (let i = 0; i < clients.size; i++) {
                  var clientWSID = [...clients][i][0];
                  if (clientWSID !== serverID) {
                    [...clients][i][1].ws.send(message);
                  }
                }
                // stream serverWS as the last one
                serverWS.send(message);
                break;
              // emit type: server;
              case 1:
                serverWS.send(message);
                break;
              // emit type: others;
              case 2:
                for (let i = 0; i < clients.size; i++) {
                  var clientWSID = [...clients][i][0];
                  if (clientWSID !== wsid) {
                    [...clients][i][1].ws.send(message);
                  }
                }
                break;
              case 3:
                // send to target
                var _wsidByteLength = ByteToInt16(message, 4);
                // _wsidByteLength
                var _wsidByte = message.slice(6, 6 + _wsidByteLength);
                var _wsid = String.fromCharCode(..._wsidByte);
                try {
                  clients.get(_wsid).ws.send(message);
                  console.log(`work! ${_wsid}`);
                } catch {}
                break;
            }
          } else {
            console.log('cannot find any active server');
          }
        }
      });
    });
  }
}

export default StreamServer;
