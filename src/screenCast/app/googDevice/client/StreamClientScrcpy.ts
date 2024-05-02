//@ts-nocheck

import { BaseClient } from "../../client/BaseClient";
import { ParamsStreamScrcpy } from "../../../types/ParamsStreamScrcpy";
import { GoogMoreBox } from "../toolbox/GoogMoreBox";
import { GoogToolBox } from "../toolbox/GoogToolBox";
import VideoSettings from "../../VideoSettings";
import Size from "../../Size";
import { ControlMessage } from "../../controlMessage/ControlMessage";
import { ClientsStats, DisplayCombinedInfo } from "../../client/StreamReceiver";
import { CommandControlMessage } from "../../controlMessage/CommandControlMessage";
import Util from "../../Util";
import FilePushHandler from "../filePush/FilePushHandler";
import DragAndPushLogger from "../DragAndPushLogger";
import { KeyEventListener, KeyInputHandler } from "../KeyInputHandler";
import { KeyCodeControlMessage } from "../../controlMessage/KeyCodeControlMessage";
import { BasePlayer, PlayerClass } from "../../player/BasePlayer";
import GoogDeviceDescriptor from "../../../types/GoogDeviceDescriptor";
import { ConfigureScrcpy } from "./ConfigureScrcpy";
import { DeviceTracker } from "./DeviceTracker";
import { ControlCenterCommand } from "../../../common/ControlCenterCommand";
import { html } from "../../ui/HtmlTag";
import {
  FeaturedInteractionHandler,
  InteractionHandlerListener,
} from "../../interactionHandler/FeaturedInteractionHandler";
import DeviceMessage from "../DeviceMessage";
import { DisplayInfo } from "../../DisplayInfo";
import { Attribute } from "../../Attribute";
import { HostTracker } from "../../client/HostTracker";
import { ACTION } from "../../../common/Action";
import { StreamReceiverScrcpy } from "./StreamReceiverScrcpy";
import { ParamsDeviceTracker } from "../../../types/ParamsDeviceTracker";
type StartParams = {
  udid: string;
  playerName?: string;
  player?: BasePlayer;
  fitToScreen?: boolean;
  videoSettings?: VideoSettings;
  serial?: string;
  deviceName?: string;
};

const TAG = "[StreamClientScrcpy]";

export class StreamClientScrcpy
  extends BaseClient<ParamsStreamScrcpy, never>
  implements KeyEventListener, InteractionHandlerListener
{
  public static ACTION = "stream";
  private static players: Map<string, PlayerClass> = new Map<
    string,
    PlayerClass
  >();

  private controlButtons?: HTMLElement;
  private deviceName = "";
  private clientId = -1;
  private clientsCount = -1;
  private joinedStream = false;
  private requestedVideoSettings?: VideoSettings;
  private touchHandler?: FeaturedInteractionHandler;
  private moreBox?: GoogMoreBox;
  private player?: BasePlayer;
  private filePushHandler?: FilePushHandler;
  private fitToScreen?: boolean;
  private readonly streamReceiver: StreamReceiverScrcpy;

  public static registerPlayer(playerClass: PlayerClass): void {
    if (playerClass.isSupported()) {
      this.players.set(playerClass.playerFullName, playerClass);
    }
  }

  public static getPlayers(): PlayerClass[] {
    return Array.from(this.players.values());
  }

  private static getPlayerClass(playerName: string): PlayerClass | undefined {
    let playerClass: PlayerClass | undefined;
    for (const value of StreamClientScrcpy.players.values()) {
      if (
        value.playerFullName === playerName ||
        value.playerCodeName === playerName
      ) {
        playerClass = value;
      }
    }
    return playerClass;
  }

  public static createPlayer(
    playerName: string,
    udid: string,
    displayInfo?: DisplayInfo
  ): BasePlayer | undefined {
    const playerClass = this.getPlayerClass(playerName);
    if (!playerClass) {
      return;
    }
    return new playerClass(udid, displayInfo);
  }

  public static getFitToScreen(
    playerName: string,
    udid: string,
    displayInfo?: DisplayInfo
  ): boolean {
    const playerClass = this.getPlayerClass(playerName);
    if (!playerClass) {
      return false;
    }
    return playerClass.getFitToScreenStatus(udid, displayInfo);
  }

  public static start(
    query: URLSearchParams | ParamsStreamScrcpy,
    streamReceiver?: StreamReceiverScrcpy,
    player?: BasePlayer,
    fitToScreen?: boolean,
    videoSettings?: VideoSettings
  ): StreamClientScrcpy {
    //@ts-ignore
    const { serial, deviceName, eventEmitter } = query;
    if (query instanceof URLSearchParams) {
      const params = StreamClientScrcpy.parseParameters(query);
      return new StreamClientScrcpy(
        params,
        streamReceiver,
        player,
        fitToScreen,
        videoSettings,
        serial,
        deviceName,
        eventEmitter
      );
    } else {
      return new StreamClientScrcpy(
        query,
        streamReceiver,
        player,
        fitToScreen,
        videoSettings,
        serial,
        deviceName,
        eventEmitter
      );
    }
  }

  private static createVideoSettingsWithBounds(
    old: VideoSettings,
    newBounds: Size
  ): VideoSettings {
    return new VideoSettings({
      crop: old.crop,
      bitrate: old.bitrate,
      bounds: newBounds,
      maxFps: old.maxFps,
      iFrameInterval: old.iFrameInterval,
      sendFrameMeta: old.sendFrameMeta,
      lockedVideoOrientation: old.lockedVideoOrientation,
      displayId: old.displayId,
      codecOptions: old.codecOptions,
      encoderName: old.encoderName,
    });
  }

  protected constructor(
    params: ParamsStreamScrcpy,
    streamReceiver?: StreamReceiverScrcpy,
    player?: BasePlayer,
    fitToScreen?: boolean,
    videoSettings?: VideoSettings,
    serial?: string,
    deviceName?: string,
    eventEmitter?: any
  ) {
    super(params);
    if (streamReceiver) {
      this.streamReceiver = streamReceiver;
    } else {
      this.streamReceiver = new StreamReceiverScrcpy(this.params);
    }
    const { udid, player: playerName } = this.params;
    this.startStream({
      udid,
      player,
      playerName,
      fitToScreen: true,
      videoSettings,
      serial,
      deviceName,
      //@ts-ignore
      eventEmitter,
    });
  }

  public static parseParameters(params: URLSearchParams): ParamsStreamScrcpy {
    const typedParams = super.parseParameters(params);
    const { action } = typedParams;
    if (action !== ACTION.STREAM_SCRCPY) {
      throw Error("Incorrect action");
    }

    return {
      ...typedParams,
      action,
      player: Util.parseString(params, "player", true),
      udid: Util.parseString(params, "udid", true),
      ws: Util.parseString(params, "ws", true),
    };
  }

  public OnDeviceMessage = (message: DeviceMessage): void => {
    if (this.moreBox) {
      this.moreBox.OnDeviceMessage(message);
    }
  };

  public onVideo = (data: ArrayBuffer): void => {
    if (!this.player) {
      return;
    }
    const STATE = BasePlayer.STATE;
    // console.log(STATE);
    if (this.player.getState() === STATE.PAUSED) {
      this.player.play();
    }
    if (this.player.getState() === STATE.PLAYING) {
      this.player.pushFrame(new Uint8Array(data));
    }
  };

  public onClientsStats = (stats: ClientsStats): void => {
    this.deviceName = stats.deviceName;
    this.clientId = stats.clientId;
    this.setTitle(`Stream ${this.deviceName}`);
  };

  public onDisplayInfo = (infoArray: DisplayCombinedInfo[]): void => {
    if (!this.player) {
      return;
    }
    let currentSettings = this.player.getVideoSettings();
    const displayId = currentSettings.displayId;
    const info = infoArray.find((value) => {
      return value.displayInfo.displayId === displayId;
    });
    if (!info) {
      return;
    }
    if (this.player.getState() === BasePlayer.STATE.PAUSED) {
      this.player.play();
    }
    const { videoSettings, screenInfo } = info;
    this.player.setDisplayInfo(info.displayInfo);
    if (typeof this.fitToScreen !== "boolean") {
      this.fitToScreen = this.player.getFitToScreenStatus();
    }
    if (this.fitToScreen) {
      const newBounds = this.getMaxSize();
      if (newBounds) {
        currentSettings = StreamClientScrcpy.createVideoSettingsWithBounds(
          currentSettings,
          newBounds
        );
        this.player.setVideoSettings(currentSettings, this.fitToScreen, false);
      }
    }
    if (!videoSettings || !screenInfo) {
      this.joinedStream = true;
      this.sendMessage(
        CommandControlMessage.createSetVideoSettingsCommand(currentSettings)
      );
      return;
    }

    this.clientsCount = info.connectionCount;
    let min = VideoSettings.copy(videoSettings);
    const oldInfo = this.player.getScreenInfo();
    if (!screenInfo.equals(oldInfo)) {
      this.player.setScreenInfo(screenInfo);
    }

    if (!videoSettings.equals(currentSettings)) {
      this.applyNewVideoSettings(
        videoSettings,
        videoSettings.equals(this.requestedVideoSettings)
      );
    }
    if (!oldInfo) {
      const bounds = currentSettings.bounds;
      const videoSize: Size = screenInfo.videoSize;
      const onlyOneClient = this.clientsCount === 0;
      const smallerThenCurrent =
        bounds &&
        (bounds.width < videoSize.width || bounds.height < videoSize.height);
      if (onlyOneClient || smallerThenCurrent) {
        min = currentSettings;
      }
      const minBounds = currentSettings.bounds?.intersect(min.bounds);
      if (minBounds && !minBounds.equals(min.bounds)) {
        min = StreamClientScrcpy.createVideoSettingsWithBounds(min, minBounds);
      }
    }
    if (!min.equals(videoSettings) || !this.joinedStream) {
      this.joinedStream = true;
      this.sendMessage(
        CommandControlMessage.createSetVideoSettingsCommand(min)
      );
    }
  };

  public onDisconnected = (udid, eventEmitter): void => {
    console.log("DISCONNECTED DISCONNECTED", udid);
    this.streamReceiver.off("deviceMessage", this.OnDeviceMessage);
    this.streamReceiver.off("video", this.onVideo);
    this.streamReceiver.off("clientsStats", this.onClientsStats);
    this.streamReceiver.off("displayInfo", this.onDisplayInfo);
    this.streamReceiver.off("disconnected", () => {
      this.onDisconnected(udid, eventEmitter);
    });
    const deviceSerialDiv = document.querySelector(`[data-streamid="${udid}"]`);
    console.log(deviceSerialDiv);
    const [ip, port] = udid.split(":");
    const removeBtn = document.getElementById(`${udid}-removeBtn`);
    const errorOverlay = deviceSerialDiv.querySelector(".error-overlay");
    //@ts-ignore
    errorOverlay.style.display = "flex";
    setTimeout(() => {
      removeBtn.click();
      eventEmitter.emit("recast", { ip });
    }, 4000);

    this.filePushHandler?.release();
    this.filePushHandler = undefined;
    this.touchHandler?.release();
    this.touchHandler = undefined;
  };

  // resizeGrid() {
  //   const videoGrid = document.getElementById('device-view');
  //   const numParticipants = videoGrid?.children.length;

  //   if (numParticipants === 1) {
  //     videoGrid.style.gridTemplateColumns = '1fr'; // Full screen for one participant
  //   } else {
  //     const columns = Math.ceil(Math.sqrt(numParticipants)); // Calculate optimal columns
  //     videoGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  //   }
  // }
  public startStream({
    udid,
    player,
    playerName,
    videoSettings,
    fitToScreen,
    serial,
    deviceName,
    //@ts-ignore
    eventEmitter,
  }: StartParams): void {
    if (!udid) {
      throw Error(`Invalid udid value: "${udid}"`);
    }

    this.fitToScreen = true;
    if (!player) {
      if (typeof playerName !== "string") {
        throw Error("Must provide BasePlayer instance or playerName");
      }
      let displayInfo: DisplayInfo | undefined;
      if (this.streamReceiver && videoSettings) {
        displayInfo = this.streamReceiver.getDisplayInfo(
          videoSettings.displayId
        );
      }
      const p = StreamClientScrcpy.createPlayer(playerName, udid, displayInfo);
      if (!p) {
        throw Error(`Unsupported player: "${playerName}"`);
      }
      if (typeof fitToScreen !== "boolean") {
        fitToScreen = StreamClientScrcpy.getFitToScreen(
          playerName,
          udid,
          displayInfo
        );
      }
      player = p;
    }
    this.player = player;
    // this.setTouchListeners(player);

    if (!videoSettings) {
      videoSettings = player.getVideoSettings();
    }
    // videoSettings.crop = new Rect(1730, 450, 1934, 974);
    // window.addEventListener('resize', this.resizeGrid);

    // const deviceView = document.createElement('div');
    // deviceView.className = 'device-view';
    // const stop = (ev?: string | Event) => {
    //     if (ev && ev instanceof Event && ev.type === 'error') {
    //         console.error(TAG, ev);
    //     }
    //     let parent;
    //     parent = deviceView.parentElement;
    //     if (parent) {
    //         parent.removeChild(deviceView);
    //     }
    //     parent = moreBox.parentElement;
    //     if (parent) {
    //         parent.removeChild(moreBox);
    //     }
    //     this.streamReceiver.stop();
    //     if (this.player) {
    //         this.player.stop();
    //     }
    // };

    // const googMoreBox = (this.moreBox = new GoogMoreBox(udid, player, this));
    // const moreBox = googMoreBox.getHolderElement();
    // googMoreBox.setOnStop(stop);
    // const googToolBox = GoogToolBox.createToolBox(udid, player, this, moreBox);
    // this.controlButtons = googToolBox.getHolderElement();
    // deviceView.appendChild(this.controlButtons);
    //@ts-ignore
    videoSettings.bitrate = 30000000;
    //@ts-ignore
    videoSettings.maxFps = 30;
    // videoSettings.bounds.height = 974;
    // videoSettings.bounds.h = 450;
    // videoSettings.bounds.width = 1730;
    // videoSettings.bounds.w = 1934;

    const video = document.createElement("div");
    video.className = "video-element";
    video.setAttribute("data-streamId", udid);
    video.setAttribute("data-serial", serial);
    video.setAttribute("data-deviceName", deviceName);

    const povOverlay = document.createElement("div");
    const povText = document.createElement("p");
    const removeBtn = document.createElement("div");
    const errorOverLay = document.createElement("div");

    const errortext = document.createElement("div");
    const reconnectingText = document.createElement("div");
    const reconnectingDots = document.createElement("span");

    errorOverLay.className = "error-overlay";
    reconnectingDots.className = "dots";
    reconnectingText.className = "reconnecting";
    reconnectingText.innerHTML = "Reconnecting";
    reconnectingText.appendChild(reconnectingDots);
    errortext.appendChild(reconnectingText);
    errorOverLay.appendChild(errortext);
    removeBtn.id = `${udid}-removeBtn`;
    removeBtn.className = "removeBtn";
    removeBtn.innerHTML = "Remove";
    povText.className = "pov-text";
    povText.innerHTML = "View POV";
    povOverlay.className = "overlay";
    povOverlay.appendChild(povText);
    video.appendChild(povOverlay);
    video.appendChild(errorOverLay);

    // deviceView.appendChild(video);
    // deviceView.appendChild(moreBox);
    player.setParent(video);
    player.pause();

    const touchLayer = video.querySelector(".touch-layer");

    // Remove the touch layer if found
    if (touchLayer) {
      video.removeChild(touchLayer);
    }

    // video.style.width = '100%';
    // video.style.height = '100%';

    // const rootEl = document.getElementById('root');
    const rootEl = document.getElementById("devices-panel");
    const targetDiv = document.getElementById("device-view");

    const headerDeviceName = document.getElementById("device-name");
    const headerDeviceSerial = document.getElementById("device-serial");
    const panelDiv = this.createPanelDiv(deviceName, serial);
    povText.addEventListener("click", (e) => {
      e.stopPropagation();
      //@ts-ignore
      if (e.target.parentElement.parentElement.id !== "device-view") {
        const deviceView = document.getElementById("device-view");
        const currentDetailsDiv = document.getElementById(serial);
        if (currentDetailsDiv) {
          currentDetailsDiv.remove();
        }
        let currentPanelDiv = null;
        if (deviceView.children.length) {
          for (let i = 0; i < deviceView.children.length; i++) {
            const childNode = deviceView.children[i]; // Get child node by index
            if (childNode.hasAttribute("data-serial")) {
              const serialNum = childNode.getAttribute("data-serial");
              const deviceName = childNode.getAttribute("data-deviceName");
              currentPanelDiv = this.createPanelDiv(deviceName, serialNum);
            }
            rootEl.appendChild(childNode);
          }
          if (currentPanelDiv) {
            rootEl.appendChild(currentPanelDiv);
          }
        }
        headerDeviceName.innerHTML = deviceName;
        headerDeviceSerial.innerHTML = serial;
        deviceView.innerHTML = "";
        deviceView.appendChild(video);
      }
    });
    if (!targetDiv.children.length) {
      targetDiv.appendChild(video);
    } else {
      rootEl.appendChild(video);
      rootEl.appendChild(panelDiv);
    }
    video.appendChild(removeBtn);
    //@ts-ignore
    removeBtn.style.opacity = 0;
    //@ts-ignore
    removeBtn.style.height = 0;
    //@ts-ignore
    removeBtn.style.width = 0;
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      video.remove();
      panelDiv.remove();

      const p_div = document.getElementById(serial);
      if (p_div) {
        p_div.remove();
      }
    });
    headerDeviceName.innerHTML = deviceName;
    headerDeviceSerial.innerHTML = serial;
    // this.updateGridLayout();
    // if (fitToScreen) {
    //   const newBounds = this.getMaxSize();
    //   if (newBounds) {
    //     videoSettings = StreamClientScrcpy.createVideoSettingsWithBounds(
    //       videoSettings,
    //       newBounds
    //     );
    //   }
    // }

    // this.resizeGrid();

    // this.applyNewVideoSettings(videoSettings, false);
    // const element = player.getTouchableElement();
    // const logger = new DragAndPushLogger(element);
    // this.filePushHandler = new FilePushHandler(
    //   element,
    //   new ScrcpyFilePushStream(this.streamReceiver)
    // );
    // this.filePushHandler.addEventListener(logger);

    const streamReceiver = this.streamReceiver;
    streamReceiver.on("deviceMessage", this.OnDeviceMessage);
    streamReceiver.on("video", this.onVideo);
    streamReceiver.on("clientsStats", this.onClientsStats);
    streamReceiver.on("displayInfo", this.onDisplayInfo);
    streamReceiver.on("disconnected", () => {
      this.onDisconnected(udid, eventEmitter);
    });
    console.log(TAG, player.getName(), udid);
  }

  public createPanelDiv(deviceName, serial) {
    const panelDiv = document.createElement("div");
    panelDiv.id = serial;
    panelDiv.className = `cast-panel w-full`;
    const initials = deviceName
      .split(" ")
      .map((i) => i[0].toUpperCase())
      .join("");
    const detailsDiv = document.createElement("div");
    detailsDiv.className = "cast-details w-full flex gap-2";
    const profileImg = document.createElement("div");
    profileImg.className =
      "vr-profile flex items-center justify-center w-20 h-20 bg-gray-300 rounded-full";
    const initialsSpan = document.createElement("span");
    initialsSpan.className = "text-4xl font-bold text-gray-700";
    initialsSpan.textContent = initials;

    // Append the initials span to the profile image div
    profileImg.appendChild(initialsSpan);
    const mainDetailDiv = document.createElement("div");
    mainDetailDiv.className = "main-details-div flex flex-col w-full";
    const nameDetails = document.createElement("div");
    nameDetails.className = "name-details flex gap-2 items-center";
    const devicename = document.createElement("p");
    devicename.innerHTML = deviceName;
    devicename.className = "font-bold text-sm";
    nameDetails.appendChild(devicename);
    const watching = document.createElement("p");
    watching.innerHTML = "Watching ";
    watching.className = "text-emerald-700 italic watching-text text-xs";
    nameDetails.appendChild(watching);
    const serialDetailsDiv = document.createElement("p");
    serialDetailsDiv.innerHTML = `VR S.No - ${serial}`;
    serialDetailsDiv.className = "text-sm";

    mainDetailDiv.appendChild(nameDetails);
    mainDetailDiv.appendChild(serialDetailsDiv);
    detailsDiv.appendChild(profileImg);
    detailsDiv.appendChild(mainDetailDiv);
    panelDiv.appendChild(detailsDiv);
    return panelDiv;
  }

  public sendMessage(message: ControlMessage): void {
    this.streamReceiver.sendEvent(message);
  }

  public getDeviceName(): string {
    return this.deviceName;
  }

  public setHandleKeyboardEvents(enabled: boolean): void {
    if (enabled) {
      KeyInputHandler.addEventListener(this);
    } else {
      KeyInputHandler.removeEventListener(this);
    }
  }

  public onKeyEvent(event: KeyCodeControlMessage): void {
    this.sendMessage(event);
  }

  public sendNewVideoSetting(videoSettings: VideoSettings): void {
    this.requestedVideoSettings = videoSettings;
    this.sendMessage(
      CommandControlMessage.createSetVideoSettingsCommand(videoSettings)
    );
  }

  public getClientId(): number {
    return this.clientId;
  }

  public getClientsCount(): number {
    return this.clientsCount;
  }

  public getMaxSize(): Size | undefined {
    if (!this.controlButtons) {
      return;
    }
    const body = document.body;
    const width = (body.clientWidth - this.controlButtons.clientWidth) & ~15;
    const height = body.clientHeight & ~15;
    return new Size(width, height);
  }

  private setTouchListeners(player: BasePlayer): void {
    if (this.touchHandler) {
      return;
    }
    this.touchHandler = new FeaturedInteractionHandler(player, this);
  }

  private applyNewVideoSettings(
    videoSettings: VideoSettings,
    saveToStorage: boolean
  ): void {
    let fitToScreen = false;

    // TODO: create control (switch/checkbox) instead
    if (
      videoSettings.bounds &&
      videoSettings.bounds.equals(this.getMaxSize())
    ) {
      fitToScreen = true;
    }
    if (this.player) {
      this.player.setVideoSettings(videoSettings, fitToScreen, saveToStorage);
    }
  }

  public static createEntryForDeviceList(
    descriptor: GoogDeviceDescriptor,
    blockClass: string,
    fullName: string,
    params: ParamsDeviceTracker
  ): HTMLElement | DocumentFragment | undefined {
    const hasPid = descriptor.pid !== -1;
    if (hasPid) {
      const configureButtonId = `configure_${Util.escapeUdid(descriptor.udid)}`;
      const e = html`<div class="stream ${blockClass}">
        <button
          ${Attribute.UDID}="${descriptor.udid}"
          ${Attribute.COMMAND}="${ControlCenterCommand.CONFIGURE_STREAM}"
          ${Attribute.FULL_NAME}="${fullName}"
          ${Attribute.SECURE}="${params.secure}"
          ${Attribute.HOSTNAME}="${params.hostname}"
          ${Attribute.PORT}="${params.port}"
          ${Attribute.USE_PROXY}="${params.useProxy}"
          id="${configureButtonId}"
          class="active action-button"
        >
          Configure stream
        </button>
      </div>`;
      const a = e.content.getElementById(configureButtonId);
      a && (a.onclick = this.onConfigureStreamClick);
      return e.content;
    }
    return;
  }

  private static onConfigureStreamClick = (event: MouseEvent): void => {
    const button = event.currentTarget as HTMLAnchorElement;
    const udid = Util.parseStringEnv(button.getAttribute(Attribute.UDID) || "");
    const fullName = button.getAttribute(Attribute.FULL_NAME);
    const secure =
      Util.parseBooleanEnv(
        button.getAttribute(Attribute.SECURE) || undefined
      ) || false;
    const hostname =
      Util.parseStringEnv(
        button.getAttribute(Attribute.HOSTNAME) || undefined
      ) || "";
    const port = Util.parseIntEnv(
      button.getAttribute(Attribute.PORT) || undefined
    );
    const useProxy = Util.parseBooleanEnv(
      button.getAttribute(Attribute.USE_PROXY) || undefined
    );
    if (!udid) {
      throw Error(`Invalid udid value: "${udid}"`);
    }
    if (typeof port !== "number") {
      throw Error(`Invalid port type: ${typeof port}`);
    }
    const tracker = DeviceTracker.getInstance({
      type: "android",
      secure,
      hostname,
      port,
      useProxy,
    });
    const descriptor = tracker.getDescriptorByUdid(udid);
    if (!descriptor) {
      return;
    }
    event.preventDefault();
    const elements = document.getElementsByName(
      `${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`
    );
    if (!elements || !elements.length) {
      return;
    }
    const select = elements[0] as HTMLSelectElement;
    const optionElement = select.options[select.selectedIndex];
    const ws = optionElement.getAttribute(Attribute.URL);
    const name = optionElement.getAttribute(Attribute.NAME);
    if (!ws || !name) {
      return;
    }
    const options: ParamsStreamScrcpy = {
      udid,
      ws,
      player: "",
      action: ACTION.STREAM_SCRCPY,
      secure,
      hostname,
      port,
      useProxy,
    };
    const dialog = new ConfigureScrcpy(tracker, descriptor, options);
    dialog.on("closed", StreamClientScrcpy.onConfigureDialogClosed);
  };

  private static onConfigureDialogClosed = (event: {
    dialog: ConfigureScrcpy;
    result: boolean;
  }): void => {
    event.dialog.off("closed", StreamClientScrcpy.onConfigureDialogClosed);
    if (event.result) {
      HostTracker.getInstance().destroy();
    }
  };
}
