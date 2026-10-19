// S03 + S05 - credits and packs. No subscription anywhere in this screen.
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { data } from "../../lib/data";
import { CENTS_PER_CREDIT_IAP } from "../../lib/catalogue";
import type { Balance, Pack } from "../../lib/types";
import { Button } from "../../components/ui/Button";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

export default function Credits() {
  const router = useRouter();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [canClaim, setCanClaim] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signedIn = data.currentUserId() !== null;

  const load = useCallback(() => {
    data.listPacks().then(setPacks);
    if (!data.currentUserId()) { setBalance(null); return; }
    data.getBalance().then(setBalance);
    data.canClaimToday().then(setCanClaim);
  }, []);
  useFocusEffect(load);

  async function claim() {
    setBusy("claim");
    try {
      const r = await data.claimDailyCredits();
      setNotice(`${r.granted} credits added. They last ${daysUntil(r.expiresAt)} days.`);
      load();
    } catch {
      setNotice("Already claimed today. Come back tomorrow.");
    } finally { setBusy(null); }
  }

  async function buy(slug: string) {
    if (!signedIn) { router.push("/sign-in"); return; }
    setBusy(slug);
    try {
      const r = await data.buyPack(slug);
      setNotice(`${r.credits} credits added. These never expire.`);
      load();
    } finally { setBusy(null); }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-1">
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          Credits
        </Text>

        {signedIn && balance ? (
          <View className="gap-1 rounded-lg border border-border bg-surface p-4">
            <Text className="text-3xl font-bold text-text"
              style={{ fontVariant: ["tabular-nums"] }}>
              {balance.balance}
            </Text>
            <Text className="text-sm text-text-muted">
              about {Math.floor(balance.balance / 25)} five-second videos
            </Text>
            {balance.expiring > 0 && balance.nextExpiry ? (
              <Text className="mt-1 text-xs text-warning">
                {balance.expiring} of these are free credits and run out in{" "}
                {daysUntil(balance.nextExpiry)} days. Credits you buy never expire.
              </Text>
            ) : null}
          </View>
        ) : null}

        {signedIn ? (
          <View className="gap-2 rounded-lg border border-border bg-surface p-4">
            <Text className="text-base font-semibold text-text">Free credits today</Text>
            <Text className="text-sm text-text-muted">
              10 credits a day, just for showing up. Seven days running adds 20 more.
            </Text>
            <Button
              label={canClaim ? "Claim 10 credits" : "Claimed today"}
              disabled={!canClaim}
              loading={busy === "claim"}
              onPress={claim}
            />
          </View>
        ) : null}

        {notice ? (
          <Text className="text-sm text-success" accessibilityLiveRegion="polite">{notice}</Text>
        ) : null}

        <View className="gap-2">
          <Text accessibilityRole="header" className="text-base font-semibold text-text">
            Buy credits
          </Text>
          <Text className="text-sm text-text-muted">
            One-off purchases. There is no subscription, so there is nothing to cancel.
          </Text>
        </View>

        {packs.map((p) => (
          <Pressable
            key={p.slug}
            accessibilityRole="button"
            // the card's own text supplies the name; a reworded label would
            // break WCAG 2.5.3 Label in Name (BUG-005)
            accessibilityHint={`Buys ${p.credits} credits for ${money(p.priceCents)}. They never expire.`}
            onPress={() => buy(p.slug)}
            className="flex-row items-center gap-3 rounded-lg border border-border bg-surface p-4 active:opacity-80"
          >
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text className="text-base font-semibold text-text">{p.label}</Text>
                {p.badge ? (
                  <View className="rounded-pill bg-accent px-2 py-0.5">
                    <Text className="text-xs font-semibold text-on-accent">
                      {p.badge === "popular" ? "Most picked" : "Best value"}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-sm text-text-muted">{p.note}</Text>
              <Text className="text-xs text-text-muted">
                {p.credits} credits · never expire
              </Text>
            </View>
            <Text className="text-base font-semibold text-text"
              style={{ fontVariant: ["tabular-nums"] }}>
              {money(p.priceCents)}
            </Text>
          </Pressable>
        ))}

        <Text className="text-xs text-text-muted">
          Prices here include the app store's cut. Buying on our website costs about{" "}
          {Math.round((1 - CENTS_PER_CREDIT_IAP / 1.66) * 100)}% less for the same credits.
        </Text>

        <Button label="Restore purchases" variant="ghost" onPress={() => {}} />
      </ScrollView>
    </SafeAreaView>
  );
}
