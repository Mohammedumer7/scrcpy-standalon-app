export enum Icon {
  BACK,
  HOME,
  OVERVIEW,
  POWER,
  VOLUME_UP,
  VOLUME_DOWN,
  MORE,
  CAMERA,
  KEYBOARD,
  CANCEL,
  OFFLINE,
  REFRESH,
  SETTINGS,
  MENU,
  ARROW_BACK,
  TOGGLE_ON,
  TOGGLE_OFF,
}

export default class SvgImage {
  static Icon = Icon;
  private static getSvgString(type: Icon): string {
    switch (type) {
      case Icon.KEYBOARD:
        return '';
      case Icon.MORE:
        return 'MoreSVG';
      case Icon.CAMERA:
        return 'CameraSVG';
      case Icon.POWER:
        return 'PowerSVG';
      case Icon.VOLUME_DOWN:
        return 'VolumeDownSVG';
      case Icon.VOLUME_UP:
        return 'VolumeUpSVG';
      case Icon.BACK:
        return 'I';
      case Icon.HOME:
        return 'HomeSVG';
      case Icon.OVERVIEW:
        return 'OverviewSVG';
      case Icon.CANCEL:
        return 'CancelSVG';
      case Icon.OFFLINE:
        return 'OfflineSVG';
      case Icon.REFRESH:
        return 'RefreshSVG';
      case Icon.SETTINGS:
        return 'SettingsSVG';
      case Icon.MENU:
        return 'MenuSVG';
      case Icon.ARROW_BACK:
        return 'ArrowBackSVG';
      case Icon.TOGGLE_ON:
        //@ts-ignore
        return ToggleOnSVG;
      case Icon.TOGGLE_OFF:
        return 'ToggleOffSVG';
      default:
        return '';
    }
  }
  public static create(type: Icon): any {
    return 'ss';
    const dummy = document.createElement('div');
    dummy.innerHTML = this.getSvgString(type);
    const svg = dummy.children[0];
    const titles = svg.getElementsByTagName('title');
    for (let i = 0, l = titles.length; i < l; i++) {
      svg.removeChild(titles[i]);
    }
    return svg;
  }
}
