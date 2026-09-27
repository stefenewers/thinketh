// Developer and demo controls: always on in development; in release builds only when explicitly enabled.
export const DEMO_CONTROLS = __DEV__ || process.env.EXPO_PUBLIC_DEMO_CONTROLS === "1";
