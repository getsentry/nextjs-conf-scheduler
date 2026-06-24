export const GREG_PSTRUCHA_SPEAKER_ID = "spk_greg_pstrucha";
export const STOP_PROMPTING_TALK_ID = "aiewf-173-stop-prompting";

export const GREG_SCHEDULE_ERROR_MESSAGE =
  "You should be at the booth instead of watching Greg talk";
export const SENTRY_SEARCH_ERROR_MESSAGE = "You should know better!";

export function isSentryEmail(email: string | null | undefined) {
  return email?.toLowerCase().endsWith("@sentry.io") === true;
}

export function isSentryTalkSearchQuery(query: string) {
  return /\bsentry\b/i.test(query);
}
