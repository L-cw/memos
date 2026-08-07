import { createContext, useContext, useEffect, useState } from "react";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { workspaceServiceClient } from "@/grpcweb";
import Loading from "@/pages/Loading";
import { useUserStore, useWorkspaceSettingStore } from "@/store/v1";
import { WorkspaceProfile } from "@/types/proto/api/v1/workspace_service";
import { WorkspaceGeneralSetting, WorkspaceSettingKey } from "@/types/proto/store/workspace_setting";
import { findNearestMatchedLanguage } from "@/utils/i18n";

interface Context {
  locale: string;
  appearance: string;
  profile: WorkspaceProfile;
  profileLoaded: boolean;
  setLocale: (locale: string) => void;
  setAppearance: (appearance: string) => void;
}

const CommonContext = createContext<Context>({
  locale: "zh-Hans",
  appearance: "system",
  profile: WorkspaceProfile.fromPartial({}),
  profileLoaded: false,
  setLocale: () => {},
  setAppearance: () => {},
});

const CommonContextProvider = ({ children }: { children: React.ReactNode }) => {
  const workspaceSettingStore = useWorkspaceSettingStore();
  const userStore = useUserStore();
  const [initialized, setInitialized] = useState(false);
  const [commonContext, setCommonContext] = useState<Pick<Context, "locale" | "appearance" | "profile" | "profileLoaded">>({
    locale: "zh-Hans",
    appearance: "system",
    profile: WorkspaceProfile.fromPartial({}),
    profileLoaded: false,
  });
  const [locale] = useLocalStorage("locale", "zh-Hans");
  const [appearance] = useLocalStorage("appearance", "system");

  useEffect(() => {
    let active = true;

    const initialWorkspace = async () => {
      const [workspaceProfile] = await Promise.all([
        workspaceServiceClient.getWorkspaceProfile({}),
        workspaceSettingStore.fetchWorkspaceSetting(WorkspaceSettingKey.GENERAL),
        workspaceSettingStore.fetchWorkspaceSetting(WorkspaceSettingKey.MEMO_RELATED),
      ]);

      const workspaceGeneralSetting =
        workspaceSettingStore.getWorkspaceSettingByKey(WorkspaceSettingKey.GENERAL).generalSetting ||
        WorkspaceGeneralSetting.fromPartial({});
      if (!active) return;
      setCommonContext({
        locale: findNearestMatchedLanguage(locale || workspaceGeneralSetting.customProfile?.locale || "zh-Hans"),
        appearance: appearance || workspaceGeneralSetting.customProfile?.appearance || "system",
        profile: workspaceProfile,
        profileLoaded: true,
      });
    };

    const initialize = async () => {
      let authenticated = false;
      try {
        await userStore.fetchAuthStatus();
        authenticated = true;
      } catch {
        authenticated = false;
      }

      const isAuthRoute = window.location.pathname === "/auth" || window.location.pathname.startsWith("/auth/");
      if (!authenticated && !isAuthRoute) {
        if (active) setInitialized(true);
        return;
      }

      const requests: Promise<unknown>[] = [initialWorkspace()];
      if (authenticated) requests.push(userStore.fetchCurrentUserSetting());
      await Promise.allSettled(requests);
      if (active) setInitialized(true);
    };

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  return (
    <CommonContext.Provider
      value={{
        ...commonContext,
        setLocale: (locale: string) => setCommonContext({ ...commonContext, locale: findNearestMatchedLanguage(locale) }),
        setAppearance: (appearance: string) => setCommonContext({ ...commonContext, appearance }),
      }}
    >
      {!initialized ? <Loading /> : <>{children}</>}
    </CommonContext.Provider>
  );
};

export const useCommonContext = () => {
  return useContext(CommonContext);
};

export default CommonContextProvider;
