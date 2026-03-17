import { extend } from "dayjs";
import localeData from "dayjs/plugin/localeData";

import { locale } from "dayjs";

/**
 * Set dayjs locale
 *
 * @param lang
 */
export function setDayjsLocale(lang: "en-US" | "zh-CN" = "zh-CN") {
  const localMap = {
    "en-US": "en",
    "zh-CN": "zh-cn",
  };

  const l: "en-US" | "zh-CN" = lang || localStorage.getItem("lang") || "zh-CN";

  locale(localMap[l]);
}

async function loadDayjsLocale(lang: "en-US" | "zh-CN") {
  if (lang === "en-US") {
    await import("dayjs/locale/en");
    return;
  }
  await import("dayjs/locale/zh-cn");
}

export async function setupDayjs() {
  extend(localeData);

  const l: "en-US" | "zh-CN" = (localStorage.getItem("lang") as any) || "zh-CN";
  await loadDayjsLocale(l);
  setDayjsLocale(l);
}
