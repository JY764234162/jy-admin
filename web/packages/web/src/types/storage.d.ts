/** The storage namespace */
declare namespace StorageType {
  interface Session {
    /** The theme color */
    themeColor: string;
    // /**
    //  * the theme settings
    //  */
    // themeSettings: App.Theme.ThemeSetting;
  }
  interface UserInfo {
    ID: number;
    username: string;
    nickName: string;
    headerImg?: string;
    authorityId: number | string;
    createdAt?: string;
    updatedAt?: string;
  }

  interface Local {
    themeMode: App.ThemeMode;
    settings: App.Setting;
    /** 基金分析页-自选基金代码列表 */
    fundSelectedCodes: string[];
    /** The token */
    token: string;
    /** The user info */
    userInfo: UserInfo;
    /** React Flow nodes */
    reactFlowNodes: any[];
    /** React Flow edges */
    reactFlowEdges: any[];
    /** Remember me credentials */
    rememberMe?: {
      username: string;
      password: string;
    };
  }
}
