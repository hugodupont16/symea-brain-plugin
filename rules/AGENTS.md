# Symea Brain Autopilot Rules

- Always query Symea Brain (`get_topic_dossier`, `hybrid_search`, `lookup_sku`) before answering corporate knowledge, product, or compliance questions.
- Before any external prospect or outbound copy, call `check_dnc_account` and strictly follow OEM and compartment isolation policies.
