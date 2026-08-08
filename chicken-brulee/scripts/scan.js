/* Chicken Brûlée — Discord Playtest Scanner
 * Fetches messages from configured Discord channels, classifies using
 * rule-based heuristics with optional DeepSeek LLM fallback, and updates
 * assets/data.js in-place (only the auto-generated section between markers).
 *
 * Usage:
 *   node scripts/scan.js                  # since last SCAN_LAST_TS
 *   node scripts/scan.js --since=2026-07-14  # since date
 *   node scripts/scan.js --dry-run        # preview only, no write
 */

const fs = require("fs");
const path = require("path");

// ── Config from env ──
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_ENABLED = !!DEEPSEEK_KEY;
const STAFF_ROLES = (process.env.DISCORD_STAFF_ROLES || "").split(",").filter(Boolean);

const CHANNEL_IDS = (process.env.DISCORD_CHANNEL_IDS || "").split(",").filter(Boolean).map(s => s.trim());
const CHANNEL_NAMES = (process.env.DISCORD_CHANNEL_NAMES || "").split(",").filter(Boolean).map(s => s.trim());

const DATA_PATH = path.resolve(__dirname, "..", "assets", "data.js");
const DISCORD_API = "https://discord.com/api/v10";
const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";

// ── Classification rules ──
const THEME_RULES = [
  { theme: "Bugs & Polish",              words: ["bug","crash","broken","debug","test item","glitch","audio","sound","music","visual","graphic","typo","spelling"] },
  { theme: "Clarity & Usability",        words: ["what does","how do i","how to","confused","unclear","understand","supposed to","what is","purpose","means","meaning"] },
  { theme: "Feedback Process",           words: ["report","re-report","prior version","bug report","reporting","tracking","reported"] },
  { theme: "Combat & Equipment",         words: ["combat","weapon","armor","equipment","gear","fighting","damage","sword","bow"] },
  { theme: "Feature Reception",          words: ["fishing","farming","mining","crafting","mini game","minigame","feature","system"] },
  { theme: "Onboarding & Quest Sequencing", words: ["quest","clear","tutorial","ronni","instruction","start","beginning","first","where do i","what do i","grogham","shop"] },
  { theme: "Progression & Resources",    words: ["xp","level","grind","resource","healing","material","gold","coin","expensive","cost","run","per run"] },
  { theme: "Inventory & Placement",      words: ["inventory","bar","deed","place","slot","action bar","tool bar","drag","equip","item stuck","can't move","can't place"] }
];

const NEG_WORDS = ["bug","broken","stuck","can't","cannot","doesn't","error","crash","issue","problem","struggling","hard","difficult","annoying","frustrat","worst","terrible","bad","missing"];
const BLOCKER_WORDS = ["can't progress","can't continue","stuck","game-breaking","can't place","can't complete","can't finish","blocked"];
const POS_WORDS = ["love","great","much better","enjoy","like ","awesome","amazing","fantastic","nice","good","fun"];

function classify(content) {
  const lower = content.toLowerCase();
  let theme = "General Feedback", bestScore = 0;
  THEME_RULES.forEach(r => {
    const s = r.words.filter(w => lower.includes(w)).length;
    if (s > bestScore) { bestScore = s; theme = r.theme; }
  });

  let signal = "Observation", severity = "Medium";
  const negHits = NEG_WORDS.filter(w => lower.includes(w)).length;
  const blockerHits = BLOCKER_WORDS.filter(w => lower.includes(w)).length;
  const posHits = POS_WORDS.filter(w => lower.includes(w)).length;
  const isQuestion = content.includes("?") || /^(what|how|why|when|where|can|should|does|is|are|do|will)\b/i.test(lower);

  if (blockerHits > 0)      { signal = "Negative / blocker"; severity = "Critical"; }
  else if (negHits >= 3)    { signal = "Negative / defect"; severity = "High"; }
  else if (negHits >= 1)    { signal = "Negative / friction"; severity = "High"; }
  else if (posHits >= 2)    { signal = "Positive"; severity = "Preserve"; }
  else if (posHits >= 1)    { signal = "Positive"; severity = "Preserve"; }
  else if (isQuestion)      { signal = "Question / possible issue"; severity = "Medium"; }

  return { theme, signal, severity, ruleConfidence: Math.min(0.5 + Math.min(bestScore, 4) * 0.1, 0.9) };
}

function isEngagement(content) {
  const lower = content.toLowerCase();
  if (content.length < 80 && /^(omg|lol|lmao|haha|nice|pog|based|welcome|yes|no|ok|thanks|ty)\b/i.test(lower)) return true;
  const eng = ["omg","lmao","xD",":D","silly","joke","poggers","pog","welcome twice","captain pigeon","trans mention"];
  return eng.filter(w => lower.includes(w)).length >= 1 && content.length < 150;
}

// ── LLM fallback ──
async function llmClassify(content, speaker) {
  if (!DEEPSEEK_ENABLED) return null;
  try {
    const prompt = `Classify this Discord playtest message from "${speaker}". Return ONLY valid JSON.

{
  "kind": "observation" or "engagement",
  "theme": "Bugs & Polish | Clarity & Usability | Feedback Process | Combat & Equipment | Feature Reception | Onboarding & Quest Sequencing | Progression & Resources | Inventory & Placement",
  "signal": "Positive | Negative / friction | Negative / defect | Negative / blocker | Question / possible issue",
  "severity": "Critical | High | Medium | Preserve",
  "paraphrase": "one concise sentence (max 120 chars)"
}

Message: "${content.slice(0, 500)}"`;

    const res = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a QA classifier. Output ONLY valid JSON. No markdown backticks." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1, max_tokens: 250
      })
    });
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("  LLM fallback failed:", e.message);
    return null;
  }
}

// ── Discord API ──
async function fetchMessages(channelId, opts = {}) {
  const p = new URLSearchParams({ limit: "100", ...opts });
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${p}`, {
    headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
  });
  if (!res.ok) { console.error(`  Discord ${res.status}`); return []; }
  return res.json();
}

async function fetchNewSince(channelId, sinceISO) {
  const all = [];
  let before = null;
  while (true) {
    const opts = { limit: 100 };
    if (before) opts.before = before;
    const batch = await fetchMessages(channelId, opts);
    if (!batch.length) break;
    let stop = false;
    for (const m of batch) {
      if (sinceISO && new Date(m.timestamp) <= new Date(sinceISO)) { stop = true; break; }
      all.push(m);
    }
    if (stop || batch.length < 100) break;
    before = batch[batch.length - 1].id;
    await new Promise(r => setTimeout(r, 600));
  }
  return all;
}

// ── Data.js I/O ──
function readMarkers() {
  const src = fs.readFileSync(DATA_PATH, "utf-8");
  const begin = src.indexOf("/* ── SCAN BEGIN ── */");
  const end = src.indexOf("/* ── SCAN END ── */");
  if (begin === -1 || end === -1) throw new Error("Markers not found in data.js");
  const before = src.slice(0, begin + "/* ── SCAN BEGIN ── */".length);
  const after = src.slice(end);
  const inner = src.slice(begin + "/* ── SCAN BEGIN ── */".length, end);

  // Extract existing message IDs
  const existingIds = new Set();
  const idRe = /messageId:\s*"(\d+)"/g;
  let m;
  while ((m = idRe.exec(inner)) !== null) existingIds.add(m[1]);

  // Extract existing counts for ID generation
  const obsCount = (inner.match(/id:\s*"O(\d+)"/g) || []).length;

  return { before, after, existingIds, obsCount };
}

function fmtTs(iso) {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} \u00b7 ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

function esc(s) { return JSON.stringify(s); }

function generateSection(newObs, newStaff, newEngagement, channels, scanLastTs) {
  const ch = channels.map(c => `  { id: "${c.id}", name: "${c.name}", label: "${c.label}" }`).join(",\n");
  const obs = newObs.map(o =>
`  {
    id: "${o.id}", messageId: "${o.messageId}", timestamp: "${o.timestamp}", channelId: "${o.channelId}", channel: "${o.channel}",
    ts: "${o.ts}", speaker: ${esc(o.speaker)}, role: "${o.role}",
    theme: ${esc(o.theme)}, signal: ${esc(o.signal)}, severity: "${o.severity}",
    excerpt: ${esc(o.excerpt)},
    paraphrase: ${esc(o.paraphrase)}
  }`
  ).join(",\n");

  const staff = newStaff.map(s =>
`  {
    timestamp: "${s.timestamp}", channelId: "${s.channelId}", channel: "${s.channel}",
    ts: "${s.ts}", speaker: ${esc(s.speaker)}, role: "${s.role}",
    theme: ${esc(s.theme)}, signal: ${esc(s.signal)},
    excerpt: ${esc(s.excerpt)},
    paraphrase: ${esc(s.paraphrase)}
  }`
  ).join(",\n");

  const eng = newEngagement.map(e =>
`  { timestamp: "${e.timestamp}", channelId: "${e.channelId}", channel: "${e.channel}", ts: "${e.ts}", speaker: ${esc(e.speaker)}, note: ${esc(e.note)} }`
  ).join(",\n");

  return `
const CHANNELS = [
${ch}
];
const SCAN_LAST_TS = "${scanLastTs}";

const OBSERVATIONS = [
${obs}
];

const STAFF = [
${staff}
];

const ENGAGEMENT = [
${eng}
];
`;
}

// ── Main ──
async function main(args) {
  const dryRun = args.includes("--dry-run");
  const sinceArg = args.find(a => a.startsWith("--since="));
  const sinceDate = sinceArg ? sinceArg.split("=")[1] : null;

  console.log("=== Chicken Brûlée Scanner ===");
  console.log(`Channels: ${CHANNEL_IDS.map((id,i) => `#${CHANNEL_NAMES[i]||id}`).join(", ")}`);
  console.log(`LLM: ${DEEPSEEK_ENABLED ? "DeepSeek enabled" : "rules only"}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  if (!DISCORD_TOKEN) { console.error("FATAL: DISCORD_BOT_TOKEN not set"); process.exit(1); }
  if (!CHANNEL_IDS.length) { console.error("FATAL: No channels configured"); process.exit(1); }

  const { before, after, existingIds, obsCount } = readMarkers();
  console.log(`Loaded data.js: ${obsCount} existing observations, ${existingIds.size} known message IDs`);

  const channels = CHANNEL_IDS.map((id, i) => ({
    id, name: CHANNEL_NAMES[i] || `channel-${i+1}`, label: `#${CHANNEL_NAMES[i] || id}`
  }));

  const sinceISO = sinceDate ? `${sinceDate}T00:00:00Z` : null;
  const scanTs = new Date().toISOString();

  const newObs = [], newStaff = [], newEng = [];
  let total = 0, rules = 0, llm = 0;

  for (const ch of channels) {
    console.log(`Scanning #${ch.name}...`);
    const msgs = await fetchNewSince(ch.id, sinceISO);
    total += msgs.length;
    console.log(`  ${msgs.length} messages fetched`);

    for (const msg of msgs) {
      if (existingIds.has(msg.id)) continue;
      if (msg.type !== 0) continue;
      if (msg.author.bot) continue;

      const content = (msg.content || "").trim();
      if (!content || content.length < 10) continue;

      const speaker = msg.author.global_name || msg.author.username || "Unknown";
      const ts = fmtTs(msg.timestamp);

      // Engagement check
      if (isEngagement(content)) {
        newEng.push({
          timestamp: msg.timestamp, channelId: ch.id, channel: ch.name,
          ts, speaker,
          note: `${esc(content.slice(0, 80))} \u2014 auto-classified engagement`
        });
        rules++;
        continue;
      }

      // Rule classification
      const cls = classify(content);
      if (cls.ruleConfidence >= 0.7) {
        newObs.push({
          id: `O${obsCount + newObs.length + 1}`,
          messageId: msg.id,
          timestamp: msg.timestamp, channelId: ch.id, channel: ch.name,
          ts, speaker, role: "Player",
          theme: cls.theme, signal: cls.signal, severity: cls.severity,
          excerpt: content.slice(0, 300),
          paraphrase: content.slice(0, 200).replace(/\n/g, " ")
        });
        rules++;
        continue;
      }

      // LLM fallback
      if (DEEPSEEK_ENABLED) {
        const llmResult = await llmClassify(content, speaker);
        await new Promise(r => setTimeout(r, 500));
        if (llmResult) {
          llm++;
          if (llmResult.kind === "engagement") {
            newEng.push({
              timestamp: msg.timestamp, channelId: ch.id, channel: ch.name,
              ts, speaker,
              note: `${esc(content.slice(0, 80))} \u2014 LLM: engagement`
            });
            continue;
          }
          newObs.push({
            id: `O${obsCount + newObs.length + 1}`,
            messageId: msg.id,
            timestamp: msg.timestamp, channelId: ch.id, channel: ch.name,
            ts, speaker, role: "Player",
            theme: llmResult.theme || cls.theme,
            signal: llmResult.signal || cls.signal,
            severity: llmResult.severity || cls.severity,
            excerpt: content.slice(0, 300),
            paraphrase: llmResult.paraphrase || content.slice(0, 200).replace(/\n/g, " ")
          });
          continue;
        }
      }

      // Default: log as engagement
      newEng.push({
        timestamp: msg.timestamp, channelId: ch.id, channel: ch.name,
        ts, speaker,
        note: `${esc(content.slice(0, 80))} \u2014 unclassified`
      });
      rules++;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== Report ===`);
  console.log(`  Total messages: ${total}`);
  console.log(`  New observations: ${newObs.length}  (rules: ${rules}, LLM: ${llm})`);
  console.log(`  New engagement:   ${newEng.length}`);
  console.log(`  New staff:        ${newStaff.length}`);

  if (dryRun) {
    console.log("\n--- Dry run preview ---");
    newObs.forEach(o => console.log(`  ${o.id} | ${o.speaker} | ${o.theme} | ${o.severity} | ${o.excerpt.slice(0,70)}`));
    return;
  }

  // Generate and write
  const section = generateSection(newObs, newStaff, newEng, channels, scanTs);
  const output = before + "\n" + section + "\n" + after;
  fs.writeFileSync(DATA_PATH, output, "utf-8");
  console.log(`\nWrote ${(output.length / 1024).toFixed(1)} KB to assets/data.js`);
}

main(process.argv.slice(2)).catch(e => { console.error("FATAL:", e); process.exit(1); });
