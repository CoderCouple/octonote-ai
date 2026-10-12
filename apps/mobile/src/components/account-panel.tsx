/**
 * The account side panel: tap your avatar (top left of every tab) and it
 * slides in from the left. Holds who you are, Shared with you (with a "New"
 * count), Settings, your plan, and Sign out — everything that isn't one of
 * the five tabs. Plain RN Modal + Animated so it runs in Expo Go.
 */
import { useRouter, type Href } from "expo-router";
import {
  ChevronRight,
  CreditCard,
  LifeBuoy,
  LogOut,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { SUPPORT_EMAIL, supportMailto } from "@octonote/shared";
import {
  useActiveMembership,
  useMe,
  useSharedWithMe,
} from "@/features/resources";
import { isNewShare, useSharedSeenAt } from "@/lib/shared-seen";
import { usePalette, type Palette } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const PanelContext = createContext<{ open: () => void }>({ open: () => {} });

export const useAccountPanel = () => useContext(PanelContext);

export function initials(name: string | undefined) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** How many shares arrived since you last opened Shared with you. */
export function useNewShareCount() {
  const shared = useSharedWithMe();
  const seen = useSharedSeenAt();
  return (shared.data ?? []).filter((i) => isNewShare(i.createdAt, seen))
    .length;
}

/**
 * Opens "Help & feedback": an email to support pre-filled with details that
 * help debugging (platform, versions, user and workspace); the user writes above them.
 */
export function useOpenSupportEmail() {
  const me = useMe().data;
  const active = useActiveMembership();
  return useCallback(() => {
    void Linking.openURL(
      supportMailto({
        platform: Platform.OS === "ios" ? "iOS" : "Android",
        appVersion: Constants.expoConfig?.version,
        system: `${Platform.OS === "ios" ? "iOS" : "Android"} ${Platform.Version}`,
        device: Constants.deviceName ?? undefined,
        userId: me?.user.id,
        email: me?.user.email,
        workspaceName: active?.workspace.name,
        workspaceId: active?.workspace.id,
      }),
    ).catch(() =>
      Alert.alert("No email app", `Write to us at ${SUPPORT_EMAIL}.`),
    );
  }, [me, active]);
}

export function AccountPanelProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(() => ({ open: () => setVisible(true) }), []);
  return (
    <PanelContext.Provider value={value}>
      {children}
      <AccountPanel visible={visible} onClose={() => setVisible(false)} />
    </PanelContext.Provider>
  );
}

function AccountPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(340, width * 0.84);
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const { signOut } = useAuth();
  const me = useMe().data;
  const active = useActiveMembership();
  const newShares = useNewShareCount();
  const openSupportEmail = useOpenSupportEmail();

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide]);

  const go = useCallback(
    (href: Href) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: slide }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close menu"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            width: panelWidth,
            backgroundColor: c.background,
            borderColor: c.separator,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 16,
            transform: [
              {
                translateX: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-panelWidth, 0],
                }),
              },
            ],
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.profile}>
          <View style={[styles.avatarLg, { backgroundColor: c.tint }]}>
            <Text style={[styles.avatarLgText, { color: c.onTint }]}>
              {initials(me?.user.name)}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: c.textStrong }]}
          >
            {me?.user.name ?? " "}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.email, { color: c.textSecondary }]}
          >
            {me?.user.email ?? " "}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.email, { color: c.textSecondary }]}
          >
            {active?.workspace.name ?? " "}
          </Text>
        </View>

        <Divider c={c} />
        <PanelRow
          c={c}
          icon={Users}
          label="Shared with you"
          trailing={newShares > 0 ? <Count c={c} n={newShares} /> : undefined}
          onPress={() => go("/shared")}
        />
        <Divider c={c} />
        <PanelRow
          c={c}
          icon={Settings}
          label="Settings"
          onPress={() => go("/settings")}
        />
        <PanelRow
          c={c}
          icon={CreditCard}
          label="Plan"
          detail="Free (beta)"
          onPress={() => go("/plan")}
        />
        <PanelRow
          c={c}
          icon={LifeBuoy}
          label="Help & feedback"
          onPress={() => {
            onClose();
            openSupportEmail();
          }}
        />
        <View style={styles.spacer} />
        <Divider c={c} />
        <PanelRow
          c={c}
          icon={LogOut}
          label="Sign out"
          chevron={false}
          onPress={async () => {
            onClose();
            await signOut();
            router.replace("/sign-in");
          }}
        />
      </Animated.View>
    </Modal>
  );
}

function PanelRow({
  c,
  icon: Icon,
  label,
  detail,
  trailing,
  chevron = true,
  onPress,
}: {
  c: Palette;
  icon: LucideIcon;
  label: string;
  detail?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: c.pressed },
      ]}
    >
      <Icon size={20} color={c.textStrong} strokeWidth={1.9} />
      <Text style={[styles.rowLabel, { color: c.textStrong }]}>{label}</Text>
      {detail ? (
        <Text style={[styles.rowDetail, { color: c.textSecondary }]}>
          {detail}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <ChevronRight size={18} color={c.textSubtle} /> : null}
    </Pressable>
  );
}

function Count({ c, n }: { c: Palette; n: number }) {
  return (
    <View style={[styles.count, { backgroundColor: c.tint }]}>
      <Text style={[styles.countText, { color: c.onTint }]}>
        {n > 99 ? "99+" : n}
      </Text>
    </View>
  );
}

function Divider({ c }: { c: Palette }) {
  return <View style={[styles.divider, { backgroundColor: c.separator }]} />;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.35)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  profile: { paddingHorizontal: 20, paddingBottom: 20, gap: 2 },
  avatarLg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarLgText: { fontSize: 18, fontWeight: "700" },
  name: { fontSize: 18, fontWeight: "700" },
  email: { fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: "500" },
  rowDetail: { fontSize: 14 },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 12, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  spacer: { flex: 1 },
});
