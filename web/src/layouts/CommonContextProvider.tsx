import { createContext, useContext, useEffect, useState } from "react";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { workspaceServiceClient } from "@/grpcweb";
import { useUserStore, useWorkspaceSettingStore } from "@/store/v1";
import { WorkspaceProfile } from "@/types/proto/api/v1/workspace_service";
import { WorkspaceGeneralSetting, WorkspaceSettingKey } from "@/types/proto/store/workspace_setting";
import { findNearestMatchedLanguage } from "@/utils/i18n";

interface Context {
  locale: string;
  appearance: string;
  profile: WorkspaceProfile;
  setLocale: (locale: string) => void;
  setAppearance: (appearance: string) => void;
}

const CommonContext = createContext<Context>({
  locale: "zh-Hans",
  appearance: "system",
  profile: WorkspaceProfile.fromPartial({}),
  setLocale: () => {},
  setAppearance: () => {},
});

const CommonContextProvider = ({ children }: { children: React.ReactNode }) => {
  const workspaceSettingStore = useWorkspaceSettingStore();
  const userStore = useUserStore();
  const [initialized, setInitialized] = useState(false);
  const [commonContext, setCommonContext] = useState<Pick<Context, "locale" | "appearance" | "profile">>({
    locale: "zh-Hans",
    appearance: "system",
    profile: WorkspaceProfile.fromPartial({}),
  });
  const [locale] = useLocalStorage("locale", "zh-Hans");
  const [appearance] = useLocalStorage("appearance", "system");

  useEffect(() => {
    const initialWorkspace = async () => {
      const workspaceProfile = await workspaceServiceClient.getWorkspaceProfile({});
      // Initial fetch for workspace settings.
      (async () => {
        [WorkspaceSettingKey.GENERAL, WorkspaceSettingKey.MEMO_RELATED].forEach(async (key) => {
          await workspaceSettingStore.fetchWorkspaceSetting(key);
        });
      })();

      const workspaceGeneralSetting =
        workspaceSettingStore.getWorkspaceSettingByKey(WorkspaceSettingKey.GENERAL).generalSetting ||
        WorkspaceGeneralSetting.fromPartial({});
      setCommonContext({
        locale: findNearestMatchedLanguage(locale || workspaceGeneralSetting.customProfile?.locale || "zh-Hans"),
        appearance: appearance || workspaceGeneralSetting.customProfile?.appearance || "system",
        profile: workspaceProfile,
      });
    };

    const initialUser = async () => {
      try {
        await userStore.fetchCurrentUser();
      } catch (error) {
        // Do nothing.
      }
    };

    Promise.all([initialWorkspace(), initialUser()]).then(() => setInitialized(true));
  }, []);

  return (
    <CommonContext.Provider
      value={{
        ...commonContext,
        setLocale: (locale: string) => setCommonContext({ ...commonContext, locale: findNearestMatchedLanguage(locale) }),
        setAppearance: (appearance: string) => setCommonContext({ ...commonContext, appearance }),
      }}
    >
      {!initialized ? null : <>{children}</>}
    </CommonContext.Provider>
  );
};

export const useCommonContext = () => {
  return useContext(CommonContext);
};

export default CommonContextProvider;
