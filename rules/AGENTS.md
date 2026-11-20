# Symea Brain Autopilot Rules (v3.0)

- Always query Symea Brain (`get_skill_tree`, `get_topic_dossier`, `hybrid_search`, `lookup_sku`) before answering corporate knowledge, workflow SOP, product, or compliance questions.
- Execute `run_skill_formula` for any calculation covered by a Skill Tree formula node; never estimate formula math mentally.
- Before any external prospect or outbound copy, call `check_dnc_account` and strictly follow OEM and compartment isolation policies.
- Invite a 1-to-10 score + strengths/weaknesses critique on substantive deliverables and persist improvements via `distill_artifact_to_playbook` or `record_skill_feedback`.
