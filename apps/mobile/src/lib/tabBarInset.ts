import { createContext, useContext } from "react";

/**
 * Room the floating tab bar takes at the bottom of a tab screen (its height plus its offset from the
 * screen edge). Provided by the tab navigator, so it's 0 on every screen outside the tabs: scroll
 * content adds it at the end so the last item scrolls clear of the glass.
 */
export const TabBarInsetContext = createContext(0);
export const useTabBarInset = () => useContext(TabBarInsetContext);
