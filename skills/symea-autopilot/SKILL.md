---
name: symea-autopilot
description: Use when answering corporate technical, commercial, compliance, Living Dossier, SKU, or governance questions via Symea Brain MCP.
---

# Symea Brain Autopilot

1. Check `list_topic_dossiers` / `get_topic_dossier` or `hybrid_search` / `lookup_sku` before answering technical, product, or commercial questions.
2. Call `get_documents_batch` instead of sequential `get_document` calls when inspecting multiple documents.
3. Always call `check_dnc_account` before drafting external outreach copy, and follow the OEM & compartment isolation rules enforced by the MCP server.
4. Use `list_auto_inbox` and `review_auto_inbox` (or `capture_compartment_note`) to promote confirmed decisions to Layer 1.
