import MobileHeader from "@/components/MobileHeader";
import { useTranslate } from "@/utils/i18n";

interface Props {
  showHeader?: boolean;
}

const PermissionDenied = ({ showHeader = true }: Props) => {
  const t = useTranslate();

  return (
    <section className="@container w-full max-w-5xl mx-auto min-h-[100svh] flex flex-col justify-start items-center sm:pt-3 md:pt-6 pb-8">
      {showHeader && <MobileHeader />}
      <div className="w-full px-4 grow flex flex-col justify-center items-center text-center sm:px-6">
        <p className="text-[8rem] leading-none font-mono dark:text-gray-300">403</p>
        <p className="mt-4 font-medium text-gray-700 dark:text-gray-300">{t("message.permission-denied")}</p>
      </div>
    </section>
  );
};

export default PermissionDenied;
