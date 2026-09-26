import { type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, space } from "@/theme/tokens";
import { Icon } from "./Icon";
import { T } from "./Text";

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <T variant="section" style={{ flex: 1 }}>
              {title}
            </T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.close}>
              <Icon name="close" size={18} color={color.ink2} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,25,24,0.28)" },
  sheet: {
    maxHeight: "82%",
    backgroundColor: color.ground,
    borderTopLeftRadius: radius.feature,
    borderTopRightRadius: radius.feature,
    paddingHorizontal: space.xl,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: color.edge, marginTop: space.s },
  header: { flexDirection: "row", alignItems: "center", paddingTop: space.l, paddingBottom: space.l },
  close: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
});
