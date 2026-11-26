# SOL6 Brain Autopilot Rules (v3.6)

- Always query SOL6 Brain (`get_skill_tree`, `get_topic_dossier`, `hybrid_search`, `lookup_sku`) before answering corporate knowledge, workflow SOP, product, or compliance questions.
- Execute `run_skill_formula` (or `run_deal_warroom` for stress testing) for any calculation covered by a Skill Tree formula node; never estimate formula math mentally.
- Before any external prospect or outbound copy, call `check_dnc_account` and strictly follow OEM and compartment isolation policies.
- Invite a 1-to-10 score + strengths/weaknesses critique on substantive deliverables and persist improvements via `distill_artifact_to_playbook` or `record_skill_feedback`.
- For active Executive Missions (`list_assigned_mission_items` / `symea://missions/assigned`), ask at most 1 natural clarifying question per turn and save confirmed facts with `submit_mission_answer`.
- Check `list_drift_events` and `scan_drift_sentinel` when MOQ, lead time, factory pricing, or CPR/DoP certificates shift against baselines.
