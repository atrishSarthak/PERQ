import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { parseProductLink, type PlanExtractResponse } from "@perq/shared";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { plannerApi } from "@/lib/plannerApi";
import { useTheme } from "@/theme/ThemeProvider";

// Other ways in (Step 3 §6.2, §6.3, §6.5): a screenshot read by Ember, or a
// pasted shop link read on the phone (the URL only; no page is fetched). The
// clipboard is only read when the user taps "Use it".

const MAX_BASE64 = 8_000_000;

function fromLink(url: string): PlanExtractResponse | null {
  const p = parseProductLink(url);
  if (!p) return null;
  return {
    draft: { ...(p.itemName ? { item: { name: p.itemName } } : {}), ...(p.merchant ? { merchant: p.merchant } : {}), offers: [], emiOptions: [] },
    missing: p.itemName ? ["price"] : ["item", "price"],
    notes: ["Links don't carry a price I can trust, so please type it.", "Add any bank offers or EMI plans you see on the page."],
    source: "link",
  };
}

export function PlanSources({ onDraft }: { onDraft: (d: PlanExtractResponse) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Only asks whether a URL is there (no paste prompt, nothing read) until the user taps.
    if (Platform.OS !== "ios") return;
    Clipboard.hasUrlAsync()
      .then(setCopied)
      .catch(() => {});
  }, []);

  const pickScreenshot = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6, allowsEditing: true });
    if (res.canceled || !res.assets[0]?.base64) return;
    const b64 = res.assets[0].base64;
    if (b64.length > MAX_BASE64) return setError("That image is too large. Crop it to the price and offers.");
    setBusy(true);
    try {
      // base64 from the picker is JPEG data (SDK 58 docs).
      onDraft(await plannerApi.extract({ kind: "image", imageBase64: b64, mimeType: "image/jpeg" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that screenshot.");
    } finally {
      setBusy(false);
    }
  };

  const useLink = (url: string) => {
    const d = fromLink(url);
    if (!d) return setError("That doesn't look like a shop link.");
    setError(null);
    onDraft(d);
  };

  const useCopied = async () => {
    const url = (await Clipboard.getUrlAsync().catch(() => null)) ?? (await Clipboard.getStringAsync().catch(() => ""));
    setCopied(false);
    if (url) useLink(url);
  };

  return (
    <View style={{ gap: t.spacing[3] }}>
      {copied ? (
        <Pressable onPress={useCopied} accessibilityRole="button" style={{ padding: t.spacing[3], borderRadius: t.radii.md, backgroundColor: t.colors.surface2 }}>
          <Text variant="small">You copied a link. Use it?</Text>
          <Text variant="small" tone="link">
            Use the link you copied ›
          </Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: "row", gap: t.spacing[3] }}>
        <Button kind="secondary" label="Add screenshot" loading={busy} onPress={pickScreenshot} style={{ flex: 1 }} />
        <Button kind="secondary" label="Paste link" onPress={() => setLinkOpen((v) => !v)} style={{ flex: 1 }} />
      </View>
      <Text variant="caption" tone="muted">
        Screenshot: crop out your name and address. Ember reads the price and offers once; the image isn't stored.
      </Text>
      {linkOpen ? (
        <View style={{ gap: t.spacing[2] }}>
          <TextField label="Shop link" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://www.flipkart.com/…" />
          <Button label="Use this link" kind="secondary" onPress={() => useLink(link)} disabled={!link.trim()} />
        </View>
      ) : null}
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
