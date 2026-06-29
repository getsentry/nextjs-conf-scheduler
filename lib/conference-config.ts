const DEFAULT_CONFERENCE_NAME = "AI Engineer World's Fair 2026";
const DEFAULT_CONFERENCE_SHORT_NAME = "AI Engineer WF 2026";
const DEFAULT_CONFERENCE_DATES = "June 29 – July 2, 2026";
const DEFAULT_CONFERENCE_LOCATION = "San Francisco, CA";
const DEFAULT_CONFERENCE_VENUE = "Moscone West";
const DEFAULT_CONFERENCE_TIME_ZONE = "America/Los_Angeles";

export const conferenceConfig = {
  name: process.env.NEXT_PUBLIC_CONFERENCE_NAME ?? DEFAULT_CONFERENCE_NAME,
  shortName: process.env.NEXT_PUBLIC_CONFERENCE_SHORT_NAME ?? DEFAULT_CONFERENCE_SHORT_NAME,
  dates: process.env.NEXT_PUBLIC_CONFERENCE_DATES ?? DEFAULT_CONFERENCE_DATES,
  location: process.env.NEXT_PUBLIC_CONFERENCE_LOCATION ?? DEFAULT_CONFERENCE_LOCATION,
  venue: process.env.NEXT_PUBLIC_CONFERENCE_VENUE ?? DEFAULT_CONFERENCE_VENUE,
  timeZone: process.env.NEXT_PUBLIC_CONFERENCE_TIME_ZONE ?? DEFAULT_CONFERENCE_TIME_ZONE,
};

export function conferenceDateLocationLabel() {
  return [conferenceConfig.dates, conferenceConfig.location].filter(Boolean).join(" · ");
}

export function conferenceVenueLabel() {
  return [conferenceConfig.venue, conferenceConfig.location].filter(Boolean).join(" in ");
}
