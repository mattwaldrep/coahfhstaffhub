// Promotion and comms channels shared by the PCO Calendar beta event card.
// Labels match the legacy calendar so readiness (isCommsLabel) counts them as comms.
export const PROMOTION_CHANNELS = [
  { key: 'pco', label: 'PCO Registrations', task: 'Set up PCO Registrations' },
  { key: 'eventbrite', label: 'Eventbrite', task: 'List on Eventbrite' },
  { key: 'google', label: 'Google My Business', task: 'List on Google My Business' },
  { key: 'community_cals', label: 'Community Cals', task: 'List on community calendars' },
  { key: 'socials', label: 'Socials', task: 'Post on socials' },
  { key: 'social_ads', label: 'Social ads', task: 'Run social ads' },
] as const;

export const COMMS_CHANNEL_OPTIONS = [
  { key: 'direct_email', label: 'Direct Email', task: 'Send direct email' },
  { key: 'push_notification', label: 'Push Notification', task: 'Send push notification' },
  { key: 'sunday_slide', label: 'ProPresenter Slide', task: 'Add to ProPresenter slides' },
  { key: 'sunday_announcement', label: 'Sunday Announcement', task: 'Add to Sunday announcements' },
  { key: 'ministry_highlight', label: 'Ministry Highlight', task: 'Feature as Ministry Highlight' },
  { key: 'newsletter', label: 'Newsletter', task: 'Include in newsletter' },
  { key: 'text_message', label: 'Text Message', task: 'Send text message' },
] as const;

const ALL = [...PROMOTION_CHANNELS, ...COMMS_CHANNEL_OPTIONS];
export const CHANNEL_KEYS = ALL.map(c => c.key) as string[];
export function channelTaskLabel(key: string): string | null {
  return ALL.find(c => c.key === key)?.task ?? null;
}
