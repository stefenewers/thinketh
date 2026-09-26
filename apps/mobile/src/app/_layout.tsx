import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from "@expo-google-fonts/inter";
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_600SemiBold,
} from "@expo-google-fonts/playfair-display";
import { color } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});
// react-native-svg's web build forwards responder props to the DOM; harmless, web-only.
// LiveKit logs the server's normal close (WS 1001) after a voice session ends as an error.
LogBox.ignoreLogs(["Unknown event handler property", "error reading from signal stream"]);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="development/[id]" />
        <Stack.Screen name="mind" />
        <Stack.Screen name="diagnostic" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="visualize/[id]" options={{ presentation: "modal" }} />
        <Stack.Screen name="make-it-stick/[id]" options={{ presentation: "modal" }} />
        <Stack.Screen name="voice" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="demo" options={{ presentation: "modal" }} />
        <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="profile" options={{ presentation: "modal" }} />
        <Stack.Screen name="storyline/[id]" />
        <Stack.Screen name="resource/[id]" />
        <Stack.Screen name="resource/add" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
