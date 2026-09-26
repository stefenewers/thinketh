import { Linking } from "react-native";

/** Open a source link in the browser. Only http(s): never app schemes or javascript: from untrusted data. */
export function openExternal(url: string | undefined): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  Linking.openURL(url).catch(() => {});
}
