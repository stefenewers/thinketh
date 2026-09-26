import { type Href, router } from "expo-router";

// After a reload or a deep link there is no history to go back to: router.back() would do
// nothing. These fall back to a sensible screen instead.

/** Back if there is somewhere to go back to, else to `fallback`. */
export function goBack(fallback: Href = "/"): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** Close this modal and open `href` in its place (e.g. Profile -> Mind). */
export function closeTo(href: Href): void {
  if (router.canGoBack()) {
    router.back();
    router.push(href);
  } else router.replace(href);
}

/** Close every modal back to the root, else go home. */
export function closeAll(): void {
  if (router.canDismiss()) router.dismissAll();
  else router.replace("/");
}
