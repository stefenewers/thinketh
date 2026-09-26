import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_600SemiBold,
} from "@expo-google-fonts/playfair-display";
import { color } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});
// react-native-svg's web build forwards responder props to the DOM; harmless, web-only.
// LiveKit logs the server's normal close (WS 1001) after a voice session ends as an error, and
// warns when a late renegotiation hits the already-closed peer connection (agent ended the call).
LogBox.ignoreLogs(["Unknown event handler property", "error reading from signal stream", "could not createOffer with closed peer connection"]);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="development/[id]" />
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
        <Stack.Screen name="playground" />
      </Stack>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
