// Chicken Brûlée — Discord Scanner Edge Function
// Deploy: supabase functions deploy scan --project-ref <ref>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const DISCORD_API = "https://discord.com/api/v10";

const THEME_RULES: { theme: string; words: string[] }[] = [
  { theme: "Bugs & Polish",              words: ["bug","crash","broken","debug","test item","glitch","audio","sound","music","visual","graphic","typo","spelling"] },
  { theme: "Clarity & Usability",        words: ["what does","how do i","how to","confused","unclear","understand","supposed to","what is","purpose","means","meaning"] },
  { theme: "Feedback Process",           words: ["report","re-report","prior version","bug report","reporting","tracking","reported"] },
  { theme: "Combat & Equipment",         words: ["combat","weapon","armor","equipment","gear","fighting","damage","sword","bow"] },
  { theme: "Feature Reception",          words: ["fishing","farming","mining","crafting","mini game","minigame","feature","system"] },
  { theme: "Onboarding & Quest Sequencing", words: ["quest","clear","tutorial","instruction","start","beginning","first","where do i","what do i","shop","guide"] },
  { theme: "Progression & Resources",    words: ["xp","level","grind","resource","healing","material","gold","coin","expensive","cost","run","per run"] },
  { theme: "Inventory & Placement",      words: ["inventory","bar","deed","place","slot","action bar","tool bar","drag","equip","item stuck","can't move","can't place"] }
];

const NEG = ["bug","broken","stuck","doesn't work","not working","error","crash","issue","problem","struggling","difficult","annoying","frustrat","worst","terrible","bad","missing","hate","disappointed","unplayable","glitch","freeze","lag"];
const BLOCKER = ["can't progress","can't continue","stuck","game-breaking","can't place","can't complete","can't finish","blocked"];
const POS = ["love","great","much better","enjoy","like ","awesome","amazing","fantastic","nice","good","fun","can't wait","excited","brilliant","excellent","wonderful","beautiful"];

function classify(content: string, customMechanics: string[]) {
  const lower = content.toLowerCase();
  let theme = "General Feedback", best = 0;

  // Custom mechanics first
  if (customMechanics.length) {
    customMechanics.forEach(m => {
      const words = m.toLowerCase().split(/\s+/);
      const hits = words.filter(w => w.length > 2 && lower.includes(w)).length;
      if (hits > best) { best = hits; theme = m; }
    });
  }

  // Fall back to generic rules
  if (best < 1) {
    for (const r of THEME_RULES) {
      const s = r.words.filter(w => lower.includes(w)).length;
      if (s > best) { best = s; theme = r.theme; }
    }
  }
  let signal = "Observation", severity = "Medium";
  const negHits = NEG.filter(w => lower.includes(w)).length;
  const blockerHits = BLOCKER.filter(w => lower.includes(w)).length;
  const posHits = POS.filter(w => lower.includes(w)).length;
  const isQuestion = content.includes("?") || /^(what|how|why|when|where|can|should|does|is|are|do|will)\b/i.test(lower);

  if (blockerHits > 0)      { signal = "Negative / blocker"; severity = "Critical"; }
  else if (negHits >= 3)    { signal = "Negative / defect"; severity = "High"; }
  else if (negHits >= 1)    { signal = "Negative / friction"; severity = "High"; }
  else if (posHits >= 2)    { signal = "Positive"; severity = "Preserve"; }
  else if (posHits >= 1)    { signal = "Positive"; severity = "Preserve"; }
  else if (isQuestion)      { signal = "Question / possible issue"; }

  return { theme, signal, severity, confidence: Math.min(0.5 + Math.min(best, 4) * 0.1, 0.9) };
}

function isEngagement(content: string) {
  const lower = content.toLowerCase();
  if (content.length < 80 && /^(omg|lol|lmao|haha|nice|pog|based|welcome|yes|no|ok|thanks|ty)\b/i.test(lower)) return true;
  const eng = ["omg","lmao","xD",":D","silly","joke","poggers","pog","welcome twice","captain pigeon","trans mention"];
  return eng.filter(w => lower.includes(w)).length >= 1 && content.length < 150;
}

async function fetchMessages(token: string, channelId: string, since?: string) {
  const all: any[] = [];
  let before: string | undefined;
  const sinceDate = since ? new Date(since) : null;

  while (true) {
    const params = new URLSearchParams({ limit: "100" });
    if (before) params.set("before", before);
    const url = `${DISCORD_API}/channels/${channelId}/messages?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Discord API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const batch = await res.json();
    if (!batch.length) break;

    let stop = false;
    for (const m of batch) {
      if (sinceDate && new Date(m.timestamp) <= sinceDate) { stop = true; break; }
      all.push(m);
    }
    if (stop || batch.length < 100) break;
    before = batch[batch.length - 1].id;
    await new Promise(r => setTimeout(r, 600));
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" }
    });
  }

  try {
    const { channelIds, since } = await req.json();
    const scanSince = since || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const authHeader = req.headers.get("Authorization") || "";

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Verify user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    // Get bot token
    const { data: config } = await supabase.from("bot_configs").select("bot_token,staff_prefixes,role_mapping,game_context").eq("user_id", user.id).single();
    if (!config?.bot_token) return new Response(JSON.stringify({ error: "No bot token configured. Add one in Settings." }), { status: 400 });

    const staffPrefixes = (config.staff_prefixes || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const roleMap: Record<string, string> = config.role_mapping || {};
    const gameCtx = config.game_context || {};
    const customMechanics: string[] = gameCtx.mechanics || [];

    // Fetch guild roles for role-based detection
    let guildRoleMap: Record<string, string> = {}; // role_id → role_name
    if (Object.keys(roleMap).length > 0) {
      try {
        // Get guild ID from first channel
        const chRes = await fetch(`${DISCORD_API}/channels/${channels[0]}`, {
          headers: { Authorization: `Bot ${config.bot_token}` }
        });
        const chData = await chRes.json();
        const guildId = chData.guild_id;
        if (guildId) {
          const roleRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
            headers: { Authorization: `Bot ${config.bot_token}` }
          });
          const roles = await roleRes.json();
          if (Array.isArray(roles)) {
            roles.forEach(r => { guildRoleMap[r.id] = r.name; });
          }
        }
      } catch (_) {}
    }

    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY") || "";
    const channels = (channelIds || []) as string[];
    const results: any[] = [];

    // Get existing message IDs to skip
    const { data: existing } = await supabase.from("observations").select("message_id").eq("user_id", user.id);
    const existingIds = new Set((existing || []).map(e => e.message_id));

    // Create scan record
    const { data: scan } = await supabase.from("scans").insert({
      user_id: user.id,
      channel_ids: channels.map(String),
      started_at: new Date().toISOString()
    }).select("id").single();
    if (!scan) throw new Error("Failed to create scan record");

    let totalFetched = 0;

    for (const chId of channels) {
      try {
        const msgs = await fetchMessages(config.bot_token, chId, scanSince);
        totalFetched += msgs.length;
        console.log(`Fetched ${msgs.length} from ${chId}`);

      for (const msg of msgs) {
        if (existingIds.has(msg.id)) continue;
        if (msg.type !== 0 || msg.author.bot) continue;
        const content = (msg.content || "").trim();
        if (!content || content.length < 10) continue;

        const speaker = msg.author.global_name || msg.author.username || "Unknown";
        const isStaff = staffPrefixes.some(p => speaker.startsWith(p) || (msg.author.username || "").startsWith(p));

        // Role-based detection: check member roles against mapping
        let speakerRole = isStaff ? "Staff" : "Player";
        if (!isStaff && msg.member?.roles && Object.keys(roleMap).length > 0) {
          for (const roleId of msg.member.roles) {
            const roleName = guildRoleMap[roleId];
            if (roleName && roleMap[roleName]) {
              speakerRole = roleMap[roleName]; // e.g. "Staff", "Ambassador", "Player"
              break;
            }
          }
        }

        if (isStaff || speakerRole === "Staff" || speakerRole === "Ambassador") {
          results.push({
            user_id: user.id, scan_id: scan.id, message_id: msg.id,
            timestamp: msg.timestamp, channel_id: chId, channel_name: String(chId),
            kind: "staff", speaker, role: speakerRole,
            theme: "Staff", signal: "Staff reply", severity: "Context",
            excerpt: content.slice(0, 300), paraphrase: content.slice(0, 200)
          });
          continue;
        }

        if (isEngagement(content)) {
          results.push({
            user_id: user.id, scan_id: scan.id, message_id: msg.id,
            timestamp: msg.timestamp, channel_id: chId, channel_name: String(chId),
            kind: "engagement", speaker, role: "Player",
            theme: "Engagement", signal: "Engagement", severity: "Context",
            excerpt: content.slice(0, 300), paraphrase: content.slice(0, 200)
          });
          continue;
        }

        const cls = classify(content, customMechanics);
        results.push({
          user_id: user.id, scan_id: scan.id, message_id: msg.id,
          timestamp: msg.timestamp, channel_id: chId, channel_name: String(chId),
          kind: "observation", speaker, role: "Player",
          theme: cls.theme, signal: cls.signal, severity: cls.severity,
          excerpt: content.slice(0, 300), paraphrase: content.slice(0, 200)
        });
      }
      } catch (e: any) {
        throw new Error(`Channel ${chId} failed: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    // Batch insert
    if (results.length > 0) {
      // Insert in batches of 50 to avoid request size limits
      for (let i = 0; i < results.length; i += 50) {
        const batch = results.slice(i, i + 50);
        const { error: insertErr } = await supabase.from("observations").upsert(batch, { onConflict: "user_id, message_id" });
        if (insertErr) console.error("Insert error:", insertErr);
      }
    }

    // Generate AI summary + insights
    let summary = "", insights = "", recommendations = "";
    const playerObs = results.filter(r => r.kind === "observation");
    if (deepseekKey && playerObs.length > 0) {
      const obsList = playerObs.slice(0, 20).map(o => `[${o.severity}] ${o.speaker}: "${o.excerpt.slice(0, 150)}"`).join("\n");
      const gameInfo = gameCtx.game_name ? `Game: ${gameCtx.game_name}. ${gameCtx.description || ""} Mechanics: ${customMechanics.join(", ")}. Playtest goals: ${gameCtx.goals || "General feedback"}.` : "";
      try {
        const sumRes = await fetch(DEEPSEEK_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: `Summarize these Discord playtest observations for a game developer. ${gameInfo}Include: top critical issues, positive feedback highlights, and key themes. Use bullet points, under 200 words.\n\n${obsList}` }],
            temperature: 0.3, max_tokens: 500
          })
        });
        summary = (await sumRes.json()).choices?.[0]?.message?.content || "";
      } catch (_) {}
      try {
        const insRes = await fetch(DEEPSEEK_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: `Analyze these playtest observations and return a JSON array of 4-6 detailed key insights. ${gameInfo}Format: [{"priority":"Critical|High|Medium","title":"short title (max 8 words)","body":"detailed 2-4 sentence insight with specific examples and actionable recommendations"}]. Focus on patterns, severity trends, and what the dev team should prioritize.\n\n${obsList}` }],
            temperature: 0.3, max_tokens: 800
          })
        });
        insights = (await insRes.json()).choices?.[0]?.message?.content || "";
      } catch (_) {}
      try {
        const recRes = await fetch(DEEPSEEK_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: `Based on these playtest observations, generate a JSON array of 5-8 prioritized, actionable recommendations for the dev team. Format: [{"priority":"Immediate|Near term","text":"specific recommendation (max 120 chars)","theme":"relevant game system or area"}]. Be specific and action-oriented. ${gameInfo}\n\n${obsList}` }],
            temperature: 0.3, max_tokens: 600
          })
        });
        recommendations = (await recRes.json()).choices?.[0]?.message?.content || "";
      } catch (_) {}
    }

    // Update scan record
    await supabase.from("scans").update({
      messages_fetched: totalFetched,
      observations_found: results.filter(r => r.kind === "observation").length,
      completed_at: new Date().toISOString(),
      summary,
      insights,
      recommendations
    }).eq("id", scan.id);

    return new Response(JSON.stringify({
      scan_id: scan.id,
      messages_fetched: totalFetched,
      observations_found: results.filter(r => r.kind === "observation").length,
      engagement_found: results.filter(r => r.kind === "engagement").length,
      total_classified: results.length
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
