function csv(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const defaultSlowSpeakerId = "spk_greg_pstrucha";
const defaultBlockedTalkId = "aiewf-173-stop-prompting";

const blockedTalkIds = csv(
  process.env.DEMO_BLOCKED_TALK_IDS ?? process.env.DEMO_BLOCKED_TALK_ID ?? defaultBlockedTalkId,
);
const slowSpeakerIds = csv(
  process.env.DEMO_SLOW_SPEAKER_IDS ?? process.env.DEMO_SLOW_SPEAKER_ID ?? defaultSlowSpeakerId,
);

export const GREG_PSTRUCHA_SPEAKER_ID = slowSpeakerIds[0] ?? defaultSlowSpeakerId;
export const STOP_PROMPTING_TALK_ID = blockedTalkIds[0] ?? defaultBlockedTalkId;

export const DEMO_BLOCKED_TALK_IDS = new Set(blockedTalkIds);
export const DEMO_SLOW_SPEAKER_IDS = new Set(slowSpeakerIds);

export const GREG_SCHEDULE_ERROR_MESSAGE =
  process.env.DEMO_SCHEDULE_ERROR_MESSAGE ??
  "You should be at the booth instead of watching Greg talk";
export const SENTRY_SEARCH_ERROR_MESSAGE =
  process.env.DEMO_SENTRY_SEARCH_ERROR_MESSAGE ?? "You should know better!";

export function isSentryEmail(email: string | null | undefined) {
  return email?.toLowerCase().endsWith("@sentry.io") === true;
}

export function isDemoBlockedTalk(talkId: string) {
  return DEMO_BLOCKED_TALK_IDS.has(talkId);
}

export function isDemoSlowSpeaker(speakerId: string) {
  return DEMO_SLOW_SPEAKER_IDS.has(speakerId);
}

export function isSentryTalkSearchQuery(query: string) {
  return /\bsentry\b/i.test(query);
}
