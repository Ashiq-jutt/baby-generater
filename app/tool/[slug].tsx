// S07-S15 - the editor. ONE screen for every tool; the difference is the
// tool's inputSchema row. This is the vertical slice: photo -> quote -> job
// -> result.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

import { data, InsufficientCredits, StaleQuote } from "../../lib/data";
import { modelById, toolBySlug } from "../../lib/catalogue";
import { assertSupported, paramsHash, UnsupportedSetting } from "../../lib/quote";
import type { Balance, Generation, GenParams, Quote } from "../../lib/types";

import { Button } from "../../components/ui/Button";
import { CreditCostButton, type CostState } from "../../components/ui/CreditCostButton";
import { GenerationProgress } from "../../components/ui/GenerationProgress";
import { LIMITS, MediaDropzone, type DropState } from "../../components/ui/MediaDropzone";
import { ResultCard } from "../../components/ui/ResultCard";
import { SettingSegmented } from "../../components/ui/SettingSegmented";
import { SkinToneControl } from "../../components/ui/SkinToneControl";

export default function ToolScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const tool = useMemo(() => toolBySlug(String(slug)), [slug]);
  const model = useMemo(() => modelById(tool.defaultModelId), [tool]);
  const schema = tool.inputSchema;

  // ---- inputs
  const [photo, setPhoto] = useState<{ uri: string; name: string } | null>(null);
  const [photoState, setPhotoState] = useState<DropState>("empty");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [freeText, setFreeText] = useState("");
  const [skinTone, setSkinTone] = useState<string | null>(null);

  const [durationS, setDurationS] = useState(schema.duration?.[0]);
  const [resolution, setResolution] = useState(schema.resolution?.[0]);
  const [aspect, setAspect] = useState(schema.aspect?.[0]);
  const [size, setSize] = useState(schema.size?.[0]);
  const [age, setAge] = useState(schema.ages?.[0]);
  const [style, setStyle] = useState(schema.styles?.[0]);

  // ---- quote + job
  const [balance, setBalance] = useState<Balance | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [gen, setGen] = useState<Generation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const submitKey = useRef<string>(`sub-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const params: GenParams = useMemo(() => ({
    durationS, resolution, aspect, size,
    prompt: prompt.trim() || undefined,
    freeText: freeText.trim() || undefined,
    age,
    style,
    skinTone: schema.skinTone ? skinTone : undefined,
    imageCount: schema.ages ? 1 : undefined,
  }), [durationS, resolution, aspect, size, prompt, freeText, age, style, skinTone, schema]);

  const currentHash = paramsHash(model.slug, params);

  const requiredMissing =
    (schema.photo?.required && !photo) ||
    (schema.prompt?.required && !prompt.trim()) ||
    (schema.freeText?.required && !freeText.trim()) ||
    (schema.audio?.required) ||     // audio recorder not built yet - see build-log
    (schema.motionRef?.required);   // motion picker not built yet

  // Re-quote whenever anything priced changes. The old quote is dropped
  // immediately so a stale price can never be submitted.
  useEffect(() => {
    if (requiredMissing) { setQuote(null); return; }
    let alive = true;
    setQuote(null);
    setQuoting(true);
    try {
      assertSupported(model, params);
    } catch (e) {
      setQuoting(false);
      setNotice(e instanceof UnsupportedSetting ? e.message : "That combination is not supported.");
      return;
    }
    setNotice(null);
    data.createQuote(tool.slug, model.slug, params)
      .then((q) => { if (alive) { setQuote(q); setQuoting(false); } })
      .catch(() => { if (alive) setQuoting(false); });
    return () => { alive = false; };
  }, [currentHash, requiredMissing, model, tool.slug, params]);

  const loadBalance = useCallback(() => {
    if (data.currentUserId()) data.getBalance().then(setBalance);
  }, []);
  useEffect(loadBalance, [loadBalance]);

  // Poll the job while it is live. Runs on resume too, because a phone app
  // gets backgrounded mid-render.
  useEffect(() => {
    if (!gen) return;
    if (gen.status === "succeeded" || gen.status === "failed" || gen.status === "cancelled") {
      loadBalance();
      return;
    }
    const id = setInterval(() => {
      data.getGeneration(gen.id).then(setGen).catch(() => {});
    }, 900);
    return () => clearInterval(id);
  }, [gen, loadBalance]);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoState("error");
      setPhotoError("We need access to your photos to do this");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.9, exif: false,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    // validate BEFORE upload, so the error arrives before the wait
    if (a.fileSize != null && a.fileSize > LIMITS.image.bytes) {
      setPhotoState("error");
      setPhotoError(`That photo is over ${LIMITS.image.label}`);
      return;
    }
    setPhotoError(null);
    setPhoto({ uri: a.uri, name: a.fileName ?? "photo.jpg" });
    setPhotoState("ready");
  }

  async function submit() {
    if (!quote) return;
    if (!data.currentUserId()) { router.push("/sign-in"); return; }
    setSubmitting(true);
    setSaved(false);
    try {
      const g = await data.submitGeneration({
        quoteId: quote.id,
        paramsHash: quote.paramsHash,
        toolSlug: tool.slug,
        modelSlug: model.slug,
        params,
        photoUri: photo?.uri,
        idempotencyKey: submitKey.current,
      });
      setGen(g);
      submitKey.current = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      loadBalance();
    } catch (e) {
      if (e instanceof InsufficientCredits) setNotice("You need more credits for this one.");
      else if (e instanceof StaleQuote) setNotice("The price moved. Check it and try again.");
      else setNotice("That did not go through. Nothing was charged.");
    } finally {
      setSubmitting(false);
    }
  }

  const affordable = quote == null || balance == null || balance.balance >= quote.credits;
  const costState: CostState =
    requiredMissing ? "incomplete"
    : submitting ? "submitting"
    : quoting ? "quoting"
    : quote == null ? "quoting"
    : quote.paramsHash !== currentHash ? "stale"
    : !affordable ? "insufficient"
    : "ready";

  const live = gen && gen.status !== "succeeded" && gen.status !== "failed"
    && gen.status !== "cancelled";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-2">
        <View className="gap-1">
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            onPress={() => router.back()}
          />
          <Text accessibilityRole="header" className="text-xl font-bold text-text">
            {tool.label}
          </Text>
          <Text className="text-sm text-text-muted">{tool.blurb}</Text>
        </View>

        {schema.photo ? (
          <MediaDropzone
            label={schema.photo.label}
            hint={schema.photo.hint}
            state={photoState}
            uri={photo?.uri}
            fileName={photo?.name}
            error={photoError}
            onPick={pickPhoto}
            onClear={() => { setPhoto(null); setPhotoState("empty"); }}
          />
        ) : null}

        {schema.audio?.required ? (
          <View className="rounded-md bg-surface p-3">
            <Text className="text-sm font-semibold text-text">Recording not built yet</Text>
            <Text className="text-xs text-text-muted">
              This tool needs in-app audio. Tracked as partial in features.csv.
            </Text>
          </View>
        ) : null}

        {schema.motionRef?.required ? (
          <View className="rounded-md bg-surface p-3">
            <Text className="text-sm font-semibold text-text">Motion picker not built yet</Text>
            <Text className="text-xs text-text-muted">
              This tool needs a sample-motion library. Tracked as partial in features.csv.
            </Text>
          </View>
        ) : null}

        {/* skin tone sits ABOVE the prompt: it is why someone picks this app */}
        {schema.skinTone ? (
          <SkinToneControl value={skinTone} onChange={setSkinTone} />
        ) : null}

        {schema.prompt ? (
          <View className="gap-2">
            <Text className="text-xs font-medium text-text-muted">{schema.prompt.label}</Text>
            {schema.prompt.examples ? (
              <View className="flex-row flex-wrap gap-2">
                {schema.prompt.examples.map((ex, i) => (
                  <Button
                    key={i}
                    label={`Example ${i + 1}`}
                    variant="secondary"
                    size="sm"
                    onPress={() => setPrompt(ex)}
                  />
                ))}
              </View>
            ) : null}
            <TextInput
              accessibilityLabel={schema.prompt.label}
              multiline
              value={prompt}
              onChangeText={setPrompt}
              placeholder={schema.prompt.placeholder}
              className="min-h-22 rounded-md border border-border-input bg-surface p-3 text-base text-text"
            />
          </View>
        ) : null}

        {schema.freeText ? (
          <View className="gap-2">
            <Text className="text-xs font-medium text-text-muted">{schema.freeText.label}</Text>
            <TextInput
              accessibilityLabel={schema.freeText.label}
              value={freeText}
              onChangeText={setFreeText}
              placeholder={schema.freeText.placeholder}
              className="min-h-touch rounded-md border border-border-input bg-surface px-3 text-base text-text"
            />
          </View>
        ) : null}

        {schema.styles ? (
          <SettingSegmented
            label="Style"
            value={style ?? ""}
            onChange={setStyle}
            options={schema.styles.map((s) => ({ value: s, label: s }))}
          />
        ) : null}

        {schema.duration ? (
          <SettingSegmented
            label="Length"
            value={String(durationS ?? "")}
            onChange={(v) => setDurationS(Number(v))}
            options={schema.duration.map((d) => ({
              value: String(d),
              label: `${d}s`,
              unavailableReason: model.maxDurationS != null && d > model.maxDurationS
                ? `${model.label} stops at ${model.maxDurationS}s` : undefined,
            }))}
          />
        ) : null}

        {schema.resolution ? (
          <SettingSegmented
            label="Quality"
            value={resolution ?? ""}
            onChange={setResolution}
            options={schema.resolution.map((r) => ({
              value: r,
              label: r,
              unavailableReason: model.resolutions.includes(r)
                ? undefined : `not available on ${model.label}`,
            }))}
          />
        ) : null}

        {schema.aspect ? (
          <SettingSegmented
            label="Shape"
            value={aspect ?? ""}
            onChange={setAspect}
            options={schema.aspect.map((a) => ({
              value: a,
              label: a === "9:16" ? "Tall" : a === "16:9" ? "Wide" : "Square",
            }))}
          />
        ) : null}

        {schema.size ? (
          <SettingSegmented
            label="Size"
            value={size ?? ""}
            onChange={setSize}
            options={schema.size.map((s) => ({ value: s, label: s.toUpperCase() }))}
          />
        ) : null}

        {schema.ages ? (
          <SettingSegmented
            label="Age"
            value={String(age ?? "")}
            onChange={(v) => setAge(Number(v))}
            options={schema.ages.map((a) => ({ value: String(a), label: `${a}` }))}
          />
        ) : null}

        {notice ? (
          <Text className="text-xs text-danger" accessibilityLiveRegion="polite">{notice}</Text>
        ) : null}

        {live && gen ? (
          <GenerationProgress
            gen={gen}
            onCancel={() => data.cancelGeneration(gen.id).then(setGen)}
          />
        ) : null}

        {gen && (gen.status === "failed" || gen.status === "cancelled") ? (
          <GenerationProgress
            gen={gen}
            onRetry={() => data.rerollGeneration(gen.id).then(setGen).catch(() => {})}
          />
        ) : null}

        {gen && gen.status === "succeeded" ? (
          <ResultCard
            gen={gen}
            saved={saved}
            onSave={() => setSaved(true)}
            onShare={() => {}}
            onReroll={gen.isFreeReroll
              ? undefined
              : () => data.rerollGeneration(gen.id).then(setGen).catch(() => {})}
          />
        ) : null}

        {!live ? (
          <CreditCostButton
            state={costState}
            credits={quote?.credits ?? null}
            balance={balance?.balance ?? 0}
            onPress={submit}
            onGetCredits={() => router.push("/credits")}
            label={gen ? "Make another" : "Generate"}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
