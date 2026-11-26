---
name: symea-autopilot
description: Use when answering corporate technical, commercial, compliance, Living Dossier, SKU, Skill Tree SOP, deterministic formula, or governance questions via SOL6 Brain MCP.
---

# SOL6 Brain Autopilot (v3.6)

1. Check `list_topic_dossiers` / `get_topic_dossier`, `list_skill_trees` / `get_skill_tree`, or `hybrid_search` / `lookup_sku` before answering technical, product, workflow, or commercial questions.
2. Call `get_documents_batch` instead of sequential `get_document` calls when inspecting multiple documents.
3. For any maths, pricing, margin, freight, or engineering sizing inside an SOP, ALWAYS execute `run_skill_formula` (or `run_deal_warroom` for multi-scenario stress tests) instead of computing in your head.
4. Before drafting external outreach copy, call `check_dnc_account` and follow OEM and compartment isolation rules enforced by the MCP server. Match personal tone via `get_own_voice_profile` when appropriate.
5. After delivering any draft (email, quote, deck, SOP, memo), invite a quick 1-to-10 rating + strengths/weaknesses pushback interview, then capture feedback via `record_skill_feedback` or `distill_artifact_to_playbook`.
6. Use `run_sop_agent` / `export_agent_pack` for Rung 2/3 shadow validation, and `list_auto_inbox` / `review_auto_inbox` to promote confirmed facts to Layer 1.
7. If you hit a missing schema, bug, or access gap, call `submit_brain_feedback` so Hugo / Empra can resolve it directly.
8. Check `list_assigned_mission_items` / `symea://missions/assigned` when a mission is active, weave at most 1 natural clarifying question into your reply, and persist confirmed answers via `submit_mission_answer`.
9. Use `list_drift_events` / `scan_drift_sentinel` when supplier quotes, lead times, MOQs, or CPR/DoP certificates change against Layer 1 baselines; executives inspect Monday digests via `get_executive_radar` / `symea://radar/latest`.
