// === SEISMIC MOCK DATA ===
// Game: "Echoes of the Abyss" — survival-crafting roguelike, underwater setting
// Developer: Abyss Studio

var GAME = {
  id: 'abyss-001',
  name: 'Echoes of the Abyss',
  studio: 'Abyss Studio',
  genre: ['survival-crafting', 'roguelike'],
  price: 19.99,
  currentStage: 1,
  momentumScore: 0,
};

var THESIS = {
  version: 1,
  revisionCount: 0,
  completeness: 85,
  audience: 'PC survival-crafting players, ages 18–34, active on r/SurvivalGaming and r/roguelikes. They play Subnautica, Raft, Dredge, and Hades. They\'re hungry for underwater exploration with base-building stakes.',
  compSet: [
    { name: 'Subnautica', price: 29.99, scope: 85, age: 2.5, peakCCU: 51000, reviews: 210000, revenue: '$120M+' },
    { name: 'Raft', price: 24.99, scope: 70, age: 3.8, peakCCU: 23000, reviews: 110000, revenue: '$60M+' },
    { name: 'Dredge', price: 24.99, scope: 55, age: 1.2, peakCCU: 12000, reviews: 32000, revenue: '$28M+' },
    { name: 'Dave the Diver', price: 19.99, scope: 65, age: 1.0, peakCCU: 98000, reviews: 85000, revenue: '$90M+' },
  ],
  hook: 'Subnautica\'s dread meets Hades\'s loop — dive, die, upgrade the Abyss, and dive again.',
  priceHypothesis: '$19.99 — premium indie pricing consistent with comp window; Dredge and Dave the Diver validated this tier for underwater-themed indies.',
  targets: {
    s3: { wishlists: 2000, desc: 'First 30 days post-page-launch' },
    s4: { wishlists: 8000, desc: '6 months pre-launch' },
    s5: { wishlists: 16000, coverageRate: 12, desc: '4 months pre-launch' },
    s6: { wishlists: 22000, demoConv: 9, desc: 'Gate threshold for launch decision' },
    s7: { launchUnits: 8000, launchRevenue: 120000, desc: 'First-week sales at $19.99' },
  },
  revisionHistory: [],
};

var MOMENTUM_HISTORY = [
  { stage: 1, score: 0, detail: 'No telemetry yet' },
  { stage: 2, score: 0, detail: 'Pre-telemetry' },
  { stage: 3, score: 62, detail: 'Wishlist velocity: 68th percentile' },
  { stage: 4, score: 71, detail: 'Velocity + test lift: 71st percentile' },
  { stage: 5, score: 78, detail: 'Coverage response: 82nd percentile' },
  { stage: 6, score: 84, detail: 'Demo conversion: 87th percentile' },
  { stage: 7, score: 91, detail: 'Launch funnel: 93rd percentile' },
  { stage: 8, score: 94, detail: 'Tail curve: 94th percentile' },
];

var GATES = [
  {
    stage: 1, title: 'Concept Gate',
    question: 'Credible evidence of an audience, at a price that supports the scope? Proceed, reshape, or stop before a dollar is spent.',
    evidence: [
      { label: 'Market Scope Verdict', value: 'Crowded core, underserved co-op adjacency — two viable tag pairs identified' },
      { label: 'Saturation Index', value: '-18% revenue-per-release over 2 years (declining competition = opportunity)' },
      { label: 'Comp Revenue Range', value: '$28M–$120M — validates $19.99 price tier' },
      { label: 'Thesis Completeness', value: '85% — audience and comp set defined, hook drafted' },
    ],
  },
  {
    stage: 2, title: 'Pre-production Gate',
    question: 'Can we name where the first 500 community members come from? If not, the Thesis\'s audience claim is unproven.',
    evidence: [
      { label: 'Audience Map Channels Found', value: '3 high-fit channels identified: r/SurvivalGaming (fit 92), r/roguelikes (fit 84), r/BaseBuildingGames (fit 78)' },
      { label: 'Combined Community Size', value: '1.8M members across top 3 channels' },
      { label: 'Recurring Need Signal', value: '"underwater survival" × 847 mentions, "roguelike base building" × 423 mentions' },
    ],
  },
  {
    stage: 3, title: 'First Playable Gate',
    question: 'Did the announcement produce wishlist velocity within range of comps at the same stage? If the hook doesn\'t read now, re-hook now: it only gets more expensive.',
    evidence: [
      { label: 'Wishlist Velocity (30-day)', value: '2,847 wishlists — 72nd percentile vs. genre-stage cohort' },
      { label: 'Page Conversion Rate', value: '4.2% — 68th percentile' },
      { label: 'Page Audit Score', value: '78/100 — 3 items flagged for fix' },
      { label: 'Community Members (Discord)', value: '312 members, 47 active weekly' },
    ],
  },
  {
    stage: 4, title: 'Pre-Alpha Gate',
    question: 'Is wishlist velocity tracking toward the launch threshold the Thesis set? First gate where the honest answer may be: bigger swing, or smaller budget.',
    evidence: [
      { label: 'Cumulative Wishlists', value: '9,120 wishlists — tracking 14% above target' },
      { label: 'Best Capsule Variant Lift', value: '+23% conversion vs. control (A/B test validated)' },
      { label: 'Festival Submissions', value: '3 festivals submitted, 1 accepted (DreamHack indie showcase)' },
      { label: 'Playtest Feedback Signal', value: 'Core loop rated 4.2/5 — underwater traversal praised, combat needs iteration' },
    ],
  },
  {
    stage: 5, title: 'Closed Beta Gate',
    question: 'Do people outside the owned community respond? Coverage response rate and lift per event tell you whether the game markets, or only its makers do.',
    evidence: [
      { label: 'Coverage Response Rate', value: '14% — 8 of 56 outreach targets covered the game (82nd percentile)' },
      { label: 'Wishlist Lift Per Event', value: '+412 wishlists avg. per coverage event' },
      { label: 'Community Advocate Count', value: '28 advocates flagged (top 10% of most active members)' },
      { label: 'Sentiment Index', value: '78/100 — positive, comps average 72 at this stage' },
    ],
  },
  {
    stage: 6, title: 'Open Beta / EA Gate',
    question: 'Demo conversion and velocity against the launch threshold: launch, extend the runway, or take the honest exit.',
    evidence: [
      { label: 'Demo Conversion Rate', value: '11.2% — 87th percentile vs. genre norms (target was 9%)' },
      { label: 'Cumulative Wishlists', value: '24,800 — above 22K target' },
      { label: 'Next Fest Performance', value: '4,120 wishlists during Next Fest (top 15% of participants)' },
      { label: 'Launch Window Congestion', value: 'Week of Oct 14 flagged as clear — 0 overlapping comp launches' },
      { label: 'Momentum Score', value: '84 — triggers Phase 2 underwriting qualification' },
    ],
  },
  {
    stage: 8, title: 'Terminal Gate — Sequel Signal',
    question: 'DLC vs. Sequel vs. Port vs. Pivot?',
    evidence: [
      { label: 'First-Year Revenue', value: '$387,000 (net) — 91st percentile for debut indie' },
      { label: 'Tail Revenue (Month 13–24)', value: '$112,000 projected — 78% decay curve (comp avg: 82%)' },
      { label: 'Franchise Appetite Score', value: '82/100 — strong demand for more content in same universe' },
      { label: 'Localization Gap', value: 'Japan = 11% of wishlists, 0% localized — $38K estimated untapped' },
    ],
  },
];

var GATE_LOG = [
  { stage: 1, decision: 'proceed', score: 0, timestamp: '2025-03-15', note: 'Market Scope validated audience exists. Thesis shaped.' },
];

var MARKET_SCOPE = {
  selectedTags: ['survival-crafting', 'roguelike'],
  revenueDistribution: { median: 180000, topQuartile: 450000, topDecile: 1200000 },
  saturationIndex: { current: '-18%', trend: 'declining', detail: 'Revenue-per-release declined 18% over 2 years — fewer releases but higher per-title earnings' },
  publisherFunding: { count: 3, detail: 'Devolver, Raw Fury, and tinyBuild actively funding this space' },
  blueOceanPairs: [
    { tags: 'survival-crafting × co-op underwater', score: 87 },
    { tags: 'roguelike × ocean exploration', score: 74 },
  ],
  compFunnels: [
    { name: 'Subnautica', wishlistVelocity: 580, pageConv: 5.8, demoConv: 14.2, launchUnits: 82000 },
    { name: 'Raft', wishlistVelocity: 410, pageConv: 4.9, demoConv: 12.1, launchUnits: 48000 },
    { name: 'Dredge', wishlistVelocity: 720, pageConv: 6.1, demoConv: 15.8, launchUnits: 32000 },
  ],
};

var AUDIENCE_MAP = {
  channels: [
    { name: 'r/SurvivalGaming', type: 'Reddit', size: 420000, fit: 92, topPhrases: ['underwater base', 'need more ocean', 'tired of zombies', 'co-op survival'] },
    { name: 'r/roguelikes', type: 'Reddit', size: 280000, fit: 84, topPhrases: ['Hades-like loop', 'meta progression', 'build variety', 'diving'] },
    { name: 'r/BaseBuildingGames', type: 'Reddit', size: 180000, fit: 78, topPhrases: ['underwater habitats', 'resource chains', 'Subnautica base'] },
    { name: 'Survival Gaming Discord', type: 'Discord', size: 28000, fit: 88, topPhrases: ['looking for new survival', 'ocean exploration', 'deep sea'] },
  ],
  vocabulary: [
    { phrase: 'underwater survival', frequency: 847 },
    { phrase: 'roguelike base building', frequency: 423 },
    { phrase: 'diving loop', frequency: 312 },
    { phrase: 'Subnautica but', frequency: 289 },
    { phrase: 'starving for co-op', frequency: 142 },
  ],
  primaryChannels: ['r/SurvivalGaming', 'Survival Gaming Discord'],
  brandCheck: { name: 'Echoes of the Abyss', domain: 'echoesoftheabyss.com', available: true, steam: 'Available', twitter: 'Taken — backup selected' },
};

var PAGE_ENGINE = {
  auditScore: 78,
  auditItems: [
    { item: 'Capsule title readable at 231px', status: 'pass', action: 'Title "Echoes of the Abyss" fully legible at store-search size' },
    { item: 'First two screenshots show core loop', status: 'fail', action: 'Current order: environment → crafting → combat. Reorder to: diving loop → base reveal → combat moment' },
    { item: 'Short description leads with genre+twist', status: 'pass', action: '"Survival-crafting roguelike set in an ever-shifting ocean abyss" — strong' },
    { item: 'Tags cover primary + secondary', status: 'fix', action: 'Add "Underwater" and "Base Building" tags — currently missing, hurting discoverability' },
    { item: 'Capsule art reads at capsule size', status: 'pass', action: 'Abyss creature silhouette + glow is distinct at small scale' },
    { item: 'GIF/video shows gameplay within 3 seconds', status: 'fix', action: 'Trailer opens with 4s of logo fade. Cut to action by frame 3' },
    { item: 'Price visible and within comp range', status: 'pass', action: '$19.99 matches Dave the Diver anchor — buyers expect this tier' },
  ],
  wishlistData: { total: 2847, velocity30Day: 95, velocityPercentile: 72, dailyAvg: 95, trend: '+12% week-over-week' },
  utmLinks: [
    { source: 'r/SurvivalGaming', link: '?utm_source=reddit&utm_medium=community&utm_campaign=announce', clicks: 412 },
    { source: 'Discord Announcement', link: '?utm_source=discord&utm_medium=owned&utm_campaign=launch', clicks: 287 },
    { source: 'Twitter/X', link: '?utm_source=twitter&utm_medium=social&utm_campaign=announce', clicks: 156 },
  ],
};

var COMMUNITY_SCAFFOLD = {
  discord: {
    members: 312, activeWeekly: 47, channels: ['announcements', 'dev-log', 'feedback', 'screenshots', 'lore-discussion', 'off-topic'],
    roles: ['Abyss Diver (Admin)', 'Leviathan (Mod)', 'Explorer (Active)', 'New Arrival'],
    feedbackForm: { categories: ['Bug', 'Balance', 'Feature Request', 'Visual/Audio', 'Lore/Suggestion'], recent: [
      { category: 'Bug', text: 'Oxygen meter disappeared after entering third biome', user: 'deepdiver42', time: '2h ago' },
      { category: 'Feature Request', text: 'Add a sonar ping mechanic for navigation in dark zones', user: 'sonar_fan', time: '5h ago' },
      { category: 'Balance', text: 'Coral harvester upgrades feel too expensive for mid-game', user: 'eco_player', time: '8h ago' },
    ]},
  },
};

var TEST_LOOP = {
  control: { variant: 'A (Current)', capsule: 'Abyss creature silhouette on dark blue', copy: '"Dive. Die. Upgrade. Repeat."', conversionRate: 4.2 },
  variants: [
    { id: 'B', capsule: 'Bioluminescent base with diver', copy: '"Build your abyss. Survive its depths."', conversionRate: 5.1, lift: '+23%', winner: true },
    { id: 'C', capsule: 'Action shot — combat vs. leviathan', copy: '"The ocean isn\'t empty. It\'s hunting."', conversionRate: 4.5, lift: '+7%', winner: false },
  ],
  liftNorm: { genreAvg: '+12%', topQuartile: '+22%' },
};

var FESTIVAL_RADAR = {
  upcoming: [
    { name: 'Steam Next Fest (October)', deadline: '2025-09-15', status: 'submitted', liftAvg: '+3,200 wishlists' },
    { name: 'DreamHack Indie Showcase', deadline: '2025-07-01', status: 'accepted', liftAvg: '+1,800 wishlists' },
    { name: 'PC Gamer Weekender', deadline: '2025-12-01', status: 'tracking', liftAvg: '+900 wishlists' },
    { name: 'The MIX (GDC)', deadline: '2026-01-15', status: 'tracking', liftAvg: '+2,100 wishlists' },
  ],
  past: [
    { name: 'INDIE Live Expo', lift: 620, date: '2025-04-12' },
  ],
};

var PLAYTEST_PIPELINE = {
  sessions: [
    { id: 1, players: 8, date: '2025-05-10', duration: '45 min', focus: 'Core loop — diving, gathering, crafting, combat' },
    { id: 2, players: 12, date: '2025-06-02', duration: '60 min', focus: 'First-hour experience + tutorial clarity' },
  ],
  findings: [
    { insight: 'Players universally loved the descent mechanic — "felt real weight"', sentiment: 'positive', frequency: '10/12 players' },
    { insight: 'Combat targeting in 3D underwater space confused 7/12 players', sentiment: 'negative', frequency: '7/12 players' },
    { insight: 'Base-building UI needs clearer resource previews', sentiment: 'neutral', frequency: '5/12 players' },
    { insight: 'Atmosphere and sound design praised as standout (9/12)', sentiment: 'positive', frequency: '9/12 players' },
  ],
  demoScope: { include: ['First biome (Coral Shallows)', 'Core crafting loop', 'One boss encounter'], cut: ['Vehicle building (unpolished)', 'Multi-biome traversal (needs more content)'] },
};

var CREATOR_MATCH = {
  creators: [
    { name: 'Splattercatgaming', platform: 'YouTube', subs: 890000, overlapScore: 94, genres: ['survival', 'indie', 'roguelike'], status: 'contacted', response: 'interested' },
    { name: 'Wanderbots', platform: 'YouTube', subs: 420000, overlapScore: 91, genres: ['roguelike', 'indie', 'action'], status: 'contacted', response: 'pending' },
    { name: 'Retromation', platform: 'YouTube', subs: 280000, overlapScore: 87, genres: ['roguelike', 'strategy', 'deckbuilder'], status: 'researched', response: null },
    { name: 'Alpha Beta Gamer', platform: 'YouTube', subs: 320000, overlapScore: 83, genres: ['indie', 'horror', 'survival'], status: 'emailed', response: 'interested' },
    { name: 'PC Gamer (Evan Lahti)', platform: 'Press', reach: '12M monthly', overlapScore: 78, genres: ['indie', 'PC'], status: 'researched', response: null },
  ],
  coverageResponseRate: 14, // percentage
  avgLiftPerEvent: 412, // wishlists
};

var SENTIMENT_RADAR = {
  currentIndex: 78,
  baseline: { comps: 72, ownCommunity: 84 },
  timeline: [
    { week: 'W1', index: 82, event: 'Announcement' },
    { week: 'W2', index: 78, event: null },
    { week: 'W3', index: 80, event: null },
    { week: 'W4', index: 76, event: 'First gameplay trailer' },
    { week: 'W5', index: 74, event: null },
    { week: 'W6', index: 79, event: 'Dev AMA on Reddit' },
    { week: 'W7', index: 77, event: null },
    { week: 'W8', index: 78, event: null },
  ],
  themes: [
    { theme: 'Atmosphere & Art', sentiment: 'positive', mentions: 234 },
    { theme: 'Combat Depth', sentiment: 'mixed', mentions: 156 },
    { theme: 'Performance', sentiment: 'negative', mentions: 89 },
    { theme: 'Feature Wishlist (co-op)', sentiment: 'positive', mentions: 198 },
  ],
};

var DEMO_COMMAND = {
  conversionRate: 11.2,
  conversionPercentile: 87,
  totalPlayers: 1840,
  wishlisted: 206,
  purchased: 0, // pre-launch
  timeSeries: [
    { day: 'Day 1', players: 420, conversions: 47, rate: 11.2 },
    { day: 'Day 2', players: 380, conversions: 43, rate: 11.3 },
    { day: 'Day 3', players: 520, conversions: 58, rate: 11.2 },
    { day: 'Day 4', players: 290, conversions: 32, rate: 11.0 },
    { day: 'Day 5', players: 230, conversions: 26, rate: 11.3 },
  ],
  nextFest: { wishlists: 4120, rank: 'Top 15%', dates: '2025-10-06 to 2025-10-13' },
};

var WINDOW_PLANNER = {
  recommendedWeek: '2025-10-14',
  rationale: 'Clear of comp genre launches. Post-Next Fest momentum peak. Steam autumn sale is 6 weeks out — safe distance.',
  congestionTable: [
    { week: 'Sep 29', conflicts: 0, compOverlap: 'None', status: 'CLEAR' },
    { week: 'Oct 6', conflicts: 1, compOverlap: 'Minimal (1 AA RPG, different genre)', status: 'OK — Next Fest week' },
    { week: 'Oct 14', conflicts: 0, compOverlap: 'None', status: 'RECOMMENDED' },
    { week: 'Oct 21', conflicts: 2, compOverlap: '1 survival game, 1 roguelike', status: 'AVOID' },
    { week: 'Oct 28', conflicts: 0, compOverlap: 'None but close to Halloween sale noise', status: 'CAUTION' },
  ],
  priceLock: { price: 19.99, comps: ['Dave the Diver ($19.99)', 'Dredge ($24.99)'], locked: true, rationale: 'Premium indie tier validated by comps. Demo conversion supports $19.99 — raising to $24.99 would reduce demo conv. by est. 15-20%.' },
};

var LAUNCH_RUNBOOK = {
  checklist: [
    { time: 'T-24h', task: 'Final build uploaded and verified on Steamworks', status: 'done' },
    { time: 'T-12h', task: 'Store page flipped from Coming Soon to full launch', status: 'done' },
    { time: 'T-6h', task: 'Press keys distributed (14 outlets)', status: 'done' },
    { time: 'T-3h', task: 'Discord launch event scheduled', status: 'done' },
    { time: 'T-1h', task: 'Social announcement queued on all channels', status: 'done' },
    { time: 'Launch', task: 'BUILD LIVE — monitor funnel', status: 'done' },
    { time: 'T+2h', task: 'Embargo lift — reviews begin posting', status: 'done' },
    { time: 'T+6h', task: 'First anomaly check — reviews, refunds, CCU', status: 'in-progress' },
    { time: 'T+12h', task: 'Community thank-you post + streamer roundup', status: 'pending' },
    { time: 'T+24h', task: 'Day-1 retrospective — compare vs. cohort', status: 'pending' },
  ],
  alerts: [
    { severity: 'info', time: 'T+4h', message: 'CCU tracking 18% above cohort baseline — strong organic traffic', action: 'No action needed. Monitor for stability.' },
    { severity: 'warn', time: 'T+6h', message: 'Review velocity 18% below cohort at hour 6 — 4 reviews vs. expected 12', action: 'Community day-one push + respond to top 3 critiques within 2 hours.' },
  ],
  funnel: { impressions: 182000, pageVisits: 34000, wishlistsConverted: 18600, unitsSold: 4200, revenue: 62790, refundRate: '2.1%', ccu: { peak: 1240, current: 980 } },
};

var LONG_TAIL = {
  revenueByQuarter: [
    { q: 'Q1', revenue: 124000, events: ['Launch'] },
    { q: 'Q2', revenue: 78000, events: ['Spring Sale (20% off)'] },
    { q: 'Q3', revenue: 52000, events: ['Bioluminescence Update'] },
    { q: 'Q4', revenue: 48000, events: ['Autumn Sale (30% off)', 'Winter Sale (35% off)'] },
    { q: 'Q5', revenue: 36000, events: ['Deep Trench DLC announce'] },
    { q: 'Q6', revenue: 31000, events: ['Lunar Sale (25% off)'] },
    { q: 'Q7', revenue: 28000, events: ['Co-op Update (major)'] },
    { q: 'Q8', revenue: 24000, events: ['Summer Sale (40% off)'] },
  ],
  decayCurve: { actual: 78, compAvg: 82, interpretation: 'Better-than-average tail retention — content updates working' },
  discountLadder: [
    { depth: '20%', revenueLift: '+$14K', compAvg: '+$11K' },
    { depth: '35%', revenueLift: '+$24K', compAvg: '+$19K' },
    { depth: '50%', revenueLift: '+$31K', compAvg: '+$28K' },
  ],
  localizationROI: [
    { market: 'Japan', wishlistsShare: '11%', localized: false, estRevenue: 38000 },
    { market: 'China', wishlistsShare: '14%', localized: true, revenue: 112000 },
    { market: 'Germany', wishlistsShare: '9%', localized: true, revenue: 48000 },
    { market: 'Brazil', wishlistsShare: '7%', localized: false, estRevenue: 22000 },
  ],
};

var SEQUEL_SIGNAL = {
  paths: [
    { path: 'DLC', score: 82, evidence: [
      'Strong franchise appetite (sentiment index 82/100)',
      'Players requesting more biomes and bosses — expandable within existing engine',
      'DLC has 60% margin vs. full sequel risk',
      'Comp DLC attach rate: 22–38% in survival genre',
    ]},
    { path: 'Sequel', score: 64, evidence: [
      'Validated audience exists and is hungry',
      'Engine improvements and scope expansion possible',
      'Higher risk: development timeline 2–3 years vs. 6 months for DLC',
    ]},
    { path: 'Port', score: 41, evidence: [
      'Switch demand detected in community threads',
      'Console port cost est. $80–120K — marginal ROI without further content',
      'Better as a post-DLC move',
    ]},
    { path: 'Pivot', score: 18, evidence: [
      'Core audience is engaged — no signal to abandon',
      'Genre metrics remain healthy — saturation declining, not growing',
    ]},
  ],
  recommendation: 'DLC',
  nextThesisDraft: {
    audience: 'Existing Echoes of the Abyss player base (est. 22,000 units) — proven buyers of underwater survival-roguelike. Secondary: Switch owners in the same demo.',
    hook: 'The Abyss just got deeper. Three new biomes, a co-op mode, and a leviathan that remembers you.',
    price: '$11.99 (DLC at ~60% of base game price, per comp norms)',
  },
};

var POOL_SUMMARY = {
  totalGames: 1240,
  activeStudios: 87,
  genresTracked: 34,
  signalsCollected: 18600,
  dataWindow: '4yr rolling',
  liveDataPct: 28,
};

// === REACH × RESONANCE QUADRANT DATA ===
var QUADRANT = {
  reachScore: 72,
  resonanceScore: 84,
  zone: 'high-reach-high-resonance',
  zones: {
    'high-reach-high-resonance': {
      label: 'High Reach / High Resonance',
      interpretation: 'People see it and they want it. Your marketing engine is working and your game delivers. This is the quadrant you want to be in at launch.',
      action: 'Lean in: lock the launch date, accelerate wishlist push, queue up Day-1 community events, and trigger the Phase 2 underwriting flag if eligible.',
      reachClass: 'reach-high', resonanceClass: 'resonance-high',
    },
    'high-reach-low-resonance': {
      label: 'High Reach / Low Resonance',
      interpretation: 'People are seeing the game but not converting. Something between the capsule and the page is losing them — or the demo/early footage doesn\'t match expectations.',
      action: 'Fix: re-test capsule art and hook copy. Check demo scope (is the strongest moment in the first 5 min?). Compare trailer view-through curve against comp norms.',
      reachClass: 'reach-high', resonanceClass: 'resonance-low',
    },
    'low-reach-high-resonance': {
      label: 'Low Reach / High Resonance',
      interpretation: 'People who see it love it, but almost nobody\'s seeing it. This is a visibility problem, not a quality problem — and it\'s the most fixable quadrant.',
      action: 'Fix: creator outreach (highest ROI), festival submissions, capsule visibility optimization, wishlist push beats, paid discovery experiments.',
      reachClass: 'reach-low', resonanceClass: 'resonance-high',
    },
    'low-reach-low-resonance': {
      label: 'Low Reach / Low Resonance',
      interpretation: 'Neither seen nor wanted — the hardest quadrant. Either the audience doesn\'t exist at sustainable scale, or the hook is fundamentally misaligned with the people who would pay for this genre.',
      action: 'Serious pivot conversation: retarget audience, fundamentally rethink the hook and comp set, or consider an honest exit before spending more.',
      reachClass: 'reach-low', resonanceClass: 'resonance-low',
    },
  },
  reachSignals: [
    { name: 'Wishlist Velocity', value: 95, label: '/day', percentile: 72, weight: 'heavy', family: 'wishlist', note: 'Reach — how fast attention is accruing (raw accumulation rate)' },
    { name: 'Page Impressions', value: 14200, label: '/mo', percentile: 68, weight: 'heavy' },
    { name: 'Creator Mentions (organic)', value: 4, label: 'channels', percentile: 74, weight: 'medium' },
    { name: 'Festival Visibility', value: 2, label: 'events', percentile: 80, weight: 'light' },
    { name: 'Trailer Views', value: 12400, label: 'total', percentile: 58, weight: 'medium' },
  ],
  resonanceSignals: [
    { name: 'Demo Conversion', value: '11.2%', label: '', percentile: 87, weight: 'heavy', dualTag: true, dualNote: 'Also feeds the Stage 6 gate decision directly — "closest thing to ground truth" the system holds before launch.' },
    { name: 'Page Conversion/CTR', value: '4.2%', label: '', percentile: 68, weight: 'heavy' },
    { name: 'Community Sentiment', value: '78/100', label: '', percentile: 82, weight: 'medium' },
    { name: 'Coverage Response Rate', value: '14%', label: '', percentile: 82, weight: 'medium' },
    { name: 'Wishlist-to-Sale Rate', value: '8.1%', label: '', percentile: 74, weight: 'medium', family: 'wishlist', note: 'Resonance — what share of accumulated attention actually converts. Same metric family as Wishlist Velocity, opposite half.' },
  ],
};

// === CREATOR AMBIENT FOOTPRINT (Stage 3 onward) ===
var AMBIENT_FOOTPRINT = {
  twitchHoursWatched: [120, 340, 210, 890, 560, 1420, 2100, 1800],
  youtubeViews: [2400, 5100, 3800, 12400, 9800, 28000, 45000, 38000],
  youtubeVideoCount: [2, 4, 3, 8, 7, 14, 22, 18],
  weekLabels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
  trend: '+32% week-over-week',
  interpretation: 'Organic interest before any outreach — Twitch and YouTube creators are finding the game on their own. Strong leading indicator.',
};

// === EXPECTATION-DELIVERY GAP ===
var EXPECTATION_GAP = {
  refundRate: '3.8%',
  refundRateComp: '2.8%',
  gapVerdict: 'wide',
  mismatchPhrases: 124,
  topMismatchTerms: ['not what I expected', 'slower than it looks', 'too short', 'promised crafting, delivered combat'],
  preLaunchSentiment: 78,
  postLaunchSentiment: 64,
  sentimentShift: -14,
  recommendation: 'Review language flagged between your pre-launch positioning and post-launch reviews. The trailer and page copy may be selling a different experience than the game delivers. Tighten the expectation-delivery gap by cutting marketing claims that overpromise.',
};

// === MARKETING BEAT LOG ===
// Extended schema: creativeVersion (refs CREATIVE_VERSIONS), channel + effort + optional spend, outreachStatus (contacted → responded → covered)
var MARKETING_BEATS = [
  { date: '2025-03-20', action: 'Steam page launch (Coming Soon)', type: 'organic', stage: 3, channel: 'Steam', effort: 'major', creativeVersion: 'CAP-1', outreachStatus: null },
  { date: '2025-03-21', action: 'Announcement post on r/SurvivalGaming', type: 'organic', stage: 3, channel: 'Reddit', effort: 'minor', creativeVersion: 'CAP-1', outreachStatus: null },
  { date: '2025-03-22', action: 'Discord server opened', type: 'organic', stage: 3, channel: 'Discord', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2025-04-05', action: 'First dev-log posted (YouTube + Steam)', type: 'organic', stage: 3, channel: 'YouTube', effort: 'minor', creativeVersion: 'TRL-1', outreachStatus: null },
  { date: '2025-04-20', action: 'GIF teaser on Twitter/X', type: 'organic', stage: 3, channel: 'X', effort: 'minor', creativeVersion: 'CAP-1', outreachStatus: null },
  { date: '2025-05-10', action: 'First structured playtest (8 players)', type: 'organic', stage: 4, channel: 'Discord', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2025-06-02', action: 'Second playtest (12 players)', type: 'organic', stage: 4, channel: 'Discord', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2025-06-15', action: 'Capsule A/B test begins', type: 'organic', stage: 4, channel: 'Steam', effort: 'major', creativeVersion: 'CAP-2', outreachStatus: null },
  { date: '2025-06-30', action: 'DreamHack Indie Showcase submission', type: 'organic', stage: 4, channel: 'festival', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2025-07-10', action: 'INDIE Live Expo participation', type: 'organic', stage: 4, channel: 'festival', effort: 'minor', creativeVersion: null, outreachStatus: null },
  { date: '2025-07-28', action: 'Creator outreach wave 1 (14 targets)', type: 'organic', stage: 5, channel: 'YouTube', effort: 'major', creativeVersion: null, outreachStatus: 'contacted' },
  { date: '2025-08-10', action: 'Splattercatgaming coverage (+1,200 wishlists)', type: 'organic', stage: 5, channel: 'YouTube', effort: 'minor', creativeVersion: 'TRL-1', outreachStatus: 'covered' },
  { date: '2025-08-25', action: 'Alpha Beta Gamer coverage (+620 wishlists)', type: 'organic', stage: 5, channel: 'YouTube', effort: 'minor', creativeVersion: null, outreachStatus: 'covered' },
  { date: '2025-09-05', action: 'PC Gamer preview goes live', type: 'organic', stage: 5, channel: 'press', effort: 'minor', creativeVersion: null, outreachStatus: 'covered' },
  { date: '2025-09-15', action: 'Steam Next Fest submission', type: 'organic', stage: 6, channel: 'Steam', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2025-09-30', action: 'Demo build released', type: 'organic', stage: 6, channel: 'Steam', effort: 'major', creativeVersion: 'TRL-2', outreachStatus: null },
  { date: '2025-10-06', action: 'Steam Next Fest begins (+4,120 wishlists)', type: 'organic', stage: 6, channel: 'festival', effort: 'major', creativeVersion: 'TRL-2', outreachStatus: null },
  { date: '2025-10-14', action: 'Launch day — page flipped to full', type: 'organic', stage: 7, channel: 'Steam', effort: 'major', creativeVersion: 'CAP-3', outreachStatus: null },
  { date: '2025-10-14', action: 'Paid Twitter/X promotion', type: 'paid', stage: 7, channel: 'X', effort: 'minor', spend: '$500', creativeVersion: 'CAP-3', outreachStatus: null },
  { date: '2025-10-15', action: 'Community Day-1 push (Discord + Reddit)', type: 'organic', stage: 7, channel: 'Discord', effort: 'minor', creativeVersion: null, outreachStatus: null },
  { date: '2025-11-20', action: 'Autumn Sale — 20% off', type: 'organic', stage: 8, channel: 'Steam', effort: 'minor', creativeVersion: null, outreachStatus: null },
  { date: '2025-12-15', action: 'Bioluminescence Update announced', type: 'organic', stage: 8, channel: 'Steam', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2025-12-22', action: 'Winter Sale — 30% off', type: 'organic', stage: 8, channel: 'Steam', effort: 'minor', creativeVersion: null, outreachStatus: null },
  { date: '2026-02-10', action: 'Deep Trench DLC announce trailer', type: 'organic', stage: 8, channel: 'YouTube', effort: 'major', creativeVersion: 'TRL-3', outreachStatus: null },
  { date: '2026-03-01', action: 'Co-op Update patch notes + trailer', type: 'organic', stage: 8, channel: 'Steam', effort: 'major', creativeVersion: null, outreachStatus: null },
  { date: '2026-03-05', action: 'Paid YouTube pre-roll — co-op update', type: 'paid', stage: 8, channel: 'YouTube', effort: 'major', spend: '$800', creativeVersion: null, outreachStatus: null },
];

// === WISHLIST GEOGRAPHY (for Window Planner price-lock) ===
var WISHLIST_GEOGRAPHY = {
  breakdown: [
    { region: 'North America', share: 38, avgPricePaid: 19.99, conversionRate: 8.5 },
    { region: 'Western Europe', share: 24, avgPricePaid: 18.49, conversionRate: 7.8 },
    { region: 'China', share: 14, avgPricePaid: 12.99, conversionRate: 6.2 },
    { region: 'Japan', share: 11, avgPricePaid: 19.99, conversionRate: 9.1 },
    { region: 'Brazil', share: 7, avgPricePaid: 9.99, conversionRate: 4.1 },
    { region: 'Other', share: 6, avgPricePaid: 15.99, conversionRate: 5.5 },
  ],
  wishlistToSaleBenchmark: '0.15x',
  churnWarning: false,
  churnNote: 'Wishlist churn (wishlist deletions) at 4.2% — within normal range (2–6% for genre). No resonance alarm triggered.',
};

// === CAPSULE CTR & TRAILER CONTINUOUS TRACKING ===
var CAPSULE_TRACKING = {
  ctrTimeline: [
    { week: 'W1', ctr: 3.8, views: 4200 },
    { week: 'W2', ctr: 4.1, views: 5100 },
    { week: 'W3', ctr: 4.2, views: 4800 },
    { week: 'W4', ctr: 4.5, views: 5200 },
    { week: 'W5', ctr: 4.3, views: 4900 },
    { week: 'W6', ctr: 4.7, views: 6800 },
    { week: 'W7', ctr: 5.1, views: 7200 },
    { week: 'W8', ctr: 4.9, views: 6500 },
  ],
  currentCtr: '4.9%',
  ctrPercentile: 68,
  trailerRetention6s: '72%',
  trailerRetentionComp: '64%',
  trailerAvgWatch: '48s',
};

// === CREATIVE VERSIONS (versioned, scored top-level asset) ===
// Feasibility note: CTR is partner-portal CSV (studio-submitted); trailer
// analytics read cleaner from the YouTube upload than Steam — both
// studio-submitted metrics, same bucket as wishlist conversion.
var CREATIVE_VERSIONS = [
  {
    versionId: 'CAP-1', assetType: 'capsule', dateLive: '2025-03-20',
    description: 'Abyss creature silhouette on dark blue — original launch capsule',
    ctr: 3.9, ctrDelta: 'baseline', trailerRetention: null, trailerDelta: null,
  },
  {
    versionId: 'CAP-2', assetType: 'capsule', dateLive: '2025-06-18',
    description: 'Bioluminescent base with diver (Test Loop Variant B)',
    ctr: 5.1, ctrDelta: '+1.2pt', trailerRetention: null, trailerDelta: null,
  },
  {
    versionId: 'CAP-3', assetType: 'capsule', dateLive: '2025-09-20',
    description: 'Action shot — combat vs. leviathan, glowing lure',
    ctr: 4.8, ctrDelta: '-0.3pt', trailerRetention: null, trailerDelta: null,
  },
  {
    versionId: 'TRL-1', assetType: 'trailer', dateLive: '2025-04-05',
    description: 'Announcement teaser — 60s, slow atmosphere build',
    ctr: null, ctrDelta: null, trailerRetention: 61, trailerDelta: 'baseline',
  },
  {
    versionId: 'TRL-2', assetType: 'trailer', dateLive: '2025-09-30',
    description: 'Demo trailer — 90s, opens on core diving loop within 3 frames',
    ctr: null, ctrDelta: null, trailerRetention: 72, trailerDelta: '+11pt',
  },
  {
    versionId: 'TRL-3', assetType: 'trailer', dateLive: '2026-02-10',
    description: 'Deep Trench DLC announce — 45s, tight hook',
    ctr: null, ctrDelta: null, trailerRetention: 74, trailerDelta: '+2pt',
  },
  {
    versionId: 'SCR-1', assetType: 'screenshots', dateLive: '2025-03-20',
    description: 'Screenshot set v1 — environment, crafting, combat order',
    ctr: null, ctrDelta: null, trailerRetention: null, trailerDelta: null,
  },
];

// === SENTIMENT RADAR EXTENSION (decay alarm + vocabulary) ===
var SENTIMENT_EXTENDED = {
  decayAlarm: {
    active: true,
    recentWindow: 71,
    allTime: 78,
    divergence: -7,
    message: 'Recent sentiment (last 2 weeks) trending below all-time average. Check for specific negative triggers — patch issues, controversial change, or competitor release?',
  },
  playerVocabulary: [
    { phrase: 'underwater exploration', freq: 412, source: 'reviews', sentiment: 'positive' },
    { phrase: 'base building', freq: 389, source: 'discord', sentiment: 'positive' },
    { phrase: 'combat feels floaty', freq: 203, source: 'reviews', sentiment: 'negative' },
    { phrase: 'atmospheric', freq: 187, source: 'reviews', sentiment: 'positive' },
    { phrase: 'need more biomes', freq: 165, source: 'discord', sentiment: 'neutral' },
    { phrase: 'Subnautica vibes', freq: 142, source: 'reviews', sentiment: 'positive' },
    { phrase: 'oxygen management', freq: 128, source: 'discord', sentiment: 'neutral' },
    { phrase: 'sound design amazing', freq: 118, source: 'reviews', sentiment: 'positive' },
    { phrase: 'crafting grind', freq: 94, source: 'reviews', sentiment: 'negative' },
    { phrase: 'Hades but underwater', freq: 87, source: 'reviews', sentiment: 'positive' },
    { phrase: 'wish there was co-op', freq: 76, source: 'discord', sentiment: 'neutral' },
    { phrase: 'boss fights intense', freq: 63, source: 'reviews', sentiment: 'positive' },
  ],
};

// === TEST LOOP EXTENSION (positioning variants) ===
var POSITIONING_VARIANTS = [
  {
    id: 'A',
    framing: 'The survival-crafting roguelike where every dive is a new run. Build an underwater base, fight leviathans, and upgrade between deaths.',
    conversionLift: '+0%',
    isControl: true,
  },
  {
    id: 'B',
    framing: 'Subnautica meets Hades. Descend into an ever-shifting ocean abyss, die trying, and build a stronger base for the next run.',
    conversionLift: '+12%',
    isControl: false,
  },
];

// === BENCHMARK REFERENCE TABLE (for contextual hints) ===
var BENCHMARKS = {
  wishlistVelocity: { min: 30, max: 400, unit: '/day', genre: 'survival-crafting roguelike' },
  demoConversion: { min: 6, max: 16, unit: '%', genre: 'survival-crafting roguelike' },
  pageConversion: { min: 2.5, max: 7, unit: '%', genre: 'survival-crafting roguelike' },
  coverageResponseRate: { min: 8, max: 22, unit: '%', genre: 'indie survival' },
  trailerRetention6s: { min: 50, max: 80, unit: '%', genre: 'indie' },
  refundRate: { min: 1.5, max: 4.5, unit: '%', genre: 'survival-crafting' },
  wishlistToSaleRate: { min: 5, max: 14, unit: '%', genre: 'survival-crafting roguelike' },
  ctr: { min: 2, max: 7, unit: '%', genre: 'indie survival' },
};
