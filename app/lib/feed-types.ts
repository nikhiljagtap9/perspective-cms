export const FEED_TYPES = [
  { id: 'MAIN_FEED', label: 'Main Feed' },
  { id: 'EMBASSY_MENTION', label: 'Embassy Mention' },
  { id: 'AMBASSADOR_MENTION', label: 'Ambassador Mention' },
  { id: 'DAILY_SUMMARY', label: 'Daily Summary' },
  { id: 'US_MENTIONS', label: 'US Mentions' },
  { id: 'GOVERNMENT_MESSAGING', label: 'Government Messaging' },
  { id: 'LEADERSHIP_MESSAGING', label: 'Leadership Messaging' },
  { id: 'BREAKING_NEWS', label: 'Breaking News' },
] as const;

export type FeedType = typeof FEED_TYPES[number]['id']; 