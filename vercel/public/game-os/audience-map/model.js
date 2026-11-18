/* Audience Map — pure analysis over /api/audience-map data (UMD: window.AudienceModel / module.exports). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AudienceModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STOP = ("a an and are as at be but by can do does for from get got has have how i i'm im if in into is it it's its just me my no not of on or out so than that the their them then there these they this to too up was we what when where which who why will with you your yours any all some more most very much can't cant don't dont didn't didnt doesn't doesnt won't wont isn't isnt " +
    "game games play playing played player players steam anyone someone something thing things way still also even ever really like one would could should help please thanks question new got make made want need know think am been being after before again only other same here over about after way time getting first every best add keep beat complete since there their would issue issues problem problems 1 2 3 4 5 6 7 8 9 10 vs").split(" ");
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  function words(s) {
    return String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  }

  /** Discord servers and other channels across comps; shared servers are merged. */
  function communities(comps) {
    var discord = {}, other = [];
    comps.forEach(function (c) {
      (c.links || []).forEach(function (l) {
        if (l.type === "discord") {
          var key = (l.discord && l.discord.server) || l.url;
          var d = discord[key] || (discord[key] = { server: (l.discord && l.discord.server) || "Discord server", url: l.url, members: l.discord ? l.discord.members : null, online: l.discord ? l.discord.online : null, comps: [] });
          if (d.comps.indexOf(c.name) < 0) d.comps.push(c.name);
        } else if (l.type !== "web" && l.type !== "facebook") {
          other.push({ type: l.type, url: l.url, comp: c.name });
        }
      });
    });
    var servers = Object.keys(discord).map(function (k) { return discord[k]; }).sort(function (a, b) { return (b.members || 0) - (a.members || 0); });
    var total = servers.reduce(function (a, s) { return a + (s.members || 0); }, 0);
    var online = servers.reduce(function (a, s) { return a + (s.online || 0); }, 0);
    return { servers: servers, other: other, totalMembers: total, totalOnline: online, compsWithDiscord: comps.filter(function (c) { return (c.links || []).some(function (l) { return l.type === "discord"; }); }).length };
  }

  /** Games Steam recommends alongside several comps, ranked by how many comps share them. */
  function neighbours(comps, limit) {
    var mine = {}; comps.forEach(function (c) { mine[c.appid] = 1; });
    var score = {};
    comps.forEach(function (c) {
      (c.moreLike || []).forEach(function (id, i) {
        if (mine[id]) return;
        var s = score[id] || (score[id] = { appid: id, comps: [], rank: 0 });
        s.comps.push(c.name); s.rank += 24 - i;
      });
    });
    return Object.keys(score).map(function (k) { return score[k]; })
      .sort(function (a, b) { return b.comps.length - a.comps.length || b.rank - a.rank; })
      .slice(0, limit || 12);
  }

  /** Player-voted tags across comps. Weight is each tag's share of that comp's top vote, summed. */
  function tagVocabulary(comps) {
    var by = {};
    comps.forEach(function (c) {
      var max = Math.max.apply(null, (c.tags || []).map(function (t) { return t.weight; }).concat([1]));
      (c.tags || []).forEach(function (t) {
        if (!t.name) return;
        var v = by[t.id] || (by[t.id] = { id: t.id, name: t.name, score: 0, comps: [] });
        v.score += t.weight / max; v.comps.push(c.name);
      });
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.comps.length - a.comps.length || b.score - a.score; });
  }

  /** Words and two-word phrases from discussion titles, counted once per thread, across comps. */
  function phrases(comps, limit) {
    var nameWords = {};
    comps.forEach(function (c) { words(c.name).forEach(function (w) { nameWords[w] = 1; }); });
    var by = {};
    comps.forEach(function (c) {
      (c.discussions || []).forEach(function (d) {
        var w = words(d.title), seen = {};
        function add(p) {
          if (seen[p]) return; seen[p] = 1;
          var v = by[p] || (by[p] = { phrase: p, threads: 0, comps: [], examples: [] });
          v.threads++; if (v.comps.indexOf(c.name) < 0) v.comps.push(c.name);
          if (v.examples.length < 3) v.examples.push({ title: d.title, comp: c.name });
        }
        var ok = function (x) { return x.length > 2 && !STOPSET[x] && !nameWords[x] && !/^\d+$/.test(x); };
        for (var i = 0; i < w.length; i++) {
          if (ok(w[i])) add(w[i]);
          if (i + 1 < w.length && ok(w[i]) && ok(w[i + 1])) add(w[i] + " " + w[i + 1]);
        }
      });
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (v) { return v.threads >= 2; });
    // Prefer phrases over single words when a phrase is nearly as common as its words.
    list.sort(function (a, b) {
      var sa = a.threads * (a.phrase.indexOf(" ") > 0 ? 1.6 : 1) * (1 + 0.3 * (a.comps.length - 1));
      var sb = b.threads * (b.phrase.indexOf(" ") > 0 ? 1.6 : 1) * (1 + 0.3 * (b.comps.length - 1));
      return sb - sa;
    });
    return list.slice(0, limit || 30);
  }

  /** Plain-text summary for the thesis "audience" field. */
  function summary(comps, com, tags, talk, picks) {
    var lines = [];
    lines.push("Audience map (" + new Date().toISOString().slice(0, 10) + ") from comps: " + comps.map(function (c) { return c.name; }).join(", ") + ".");
    var p = (picks && picks.length ? picks : com.servers.slice(0, 2).map(function (s) { return s.server + " Discord"; }));
    if (p.length) lines.push("Primary channels: " + p.join("; ") + ".");
    if (com.servers.length) lines.push("Comp Discords: " + com.servers.slice(0, 5).map(function (s) { return s.server + " (" + (s.members || 0).toLocaleString("en-US") + " members)"; }).join(", ") + ".");
    if (tags.length) lines.push("Players call these games: " + tags.slice(0, 10).map(function (t) { return t.name; }).join(", ") + ".");
    if (talk.length) lines.push("Words in their discussions: " + talk.slice(0, 12).map(function (t) { return t.phrase; }).join(", ") + ".");
    return lines.join("\n");
  }

  return { communities: communities, neighbours: neighbours, tagVocabulary: tagVocabulary, phrases: phrases, summary: summary, words: words };
});
