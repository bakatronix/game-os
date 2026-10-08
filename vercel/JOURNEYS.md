# Journey definitions — draft for review

Per Jay's spec, each tool needs its "got value" moment defined before it ships.
Price-calc is defined and instrumented. These three are **proposals** — change
freely.

Convention: `journey_complete` = the "got value" moment. `josurney_step` tracks
progress toward it. `output_action` = acting on the result (export/share/save).

## Chicken Brûlée (Discord playtest scanner)
**Proposed journey:** `config_saved` → `scan_run` → `observations_reviewed` → `insight_actioned`

- `journey_step: config_saved` — user pastes bot token + channels and saves.
- `journey_step: scan_run` — a scan completes with ≥1 observation.
- **`journey_complete: observations_reviewed`** — user opens the dashboard after a scan (sees themes/severity).
- `output_action` — exports/dispatches feedback, or copies an insight.

*Rationale:* the value is turning raw Discord chatter into structured signal; that moment is seeing the scan results.

## PMF Analyzer (Steam appid → 3-lens report)
**Proposed journey:** `app_id_entered` → `analysis_run` → `report_viewed` → `report_actioned`

- `journey_step: app_id_entered` — a valid appid is submitted.
- `journey_step: analysis_run` — `/api/v1/analyze` returns 200.
- **`journey_complete: report_viewed`** — the lens scores + label render.
- `output_action` — export/share the report or copy recommendations.

*Rationale:* matches the pricing calculator's shape; the value is the 3-lens read.

## Seismic (publishing lifecycle mockflow)
**Proposed journey:** `stage_entered` → `tool_opened` → `gate_decision` → `thesis_revised`

- `journey_step: stage_entered` — user selects a lifecycle stage.
- `journey_step: tool_opened` — a tool within a stage is opened.
- **`journey_complete: gate_decision`** — a gate is decided (proceed/revise/stop).
- `output_action` — exports the thesis / shares a gate outcome.

*Rationale:* Seismic's spine is the gate loop; deciding a gate is the value.

---

## Highest-value future journey (the wedge)
**Free Page Audit:** `app_id_entered` → `audit_viewed` → (`waitlist_signup` | `discord_join`).
This one funnels directly into Layer 1 and is the top-priority journey per the spec.
