# Simplify NCP README Positioning — Learn from Concierge

## Context

[concierge-hq/concierge](https://github.com/concierge-hq/concierge) is getting traction with a simpler framing of concepts NCP already has. Their README communicates progressive tool disclosure and workflow orchestration using three simple primitives: **Stages**, **Transitions**, **State**.

NCP has all of this and more, but the pitch is denser. Worth borrowing their framing clarity.

## Comparison

| Concierge Concept | NCP Equivalent | NCP Advantage |
|-------------------|---------------|---------------|
| Stages (group tools) | `find` with semantic RAG discovery | AI-driven, not manually defined |
| Transitions (enforce order) | Code mode — TypeScript orchestration | Full programming language, not just declarations |
| Semantic tool search | RAG engine + vector embeddings | Confidence scoring, health-aware routing |
| State management | Photon daemon state + code mode context | Cross-process, persistent |
| Token reduction (78%) | 87% at enterprise scale | Measured across 50+ MCPs |
| — | Scheduling | Background automation with cron/NL |
| — | Health monitoring | Automatic failover |
| — | Code execution sandbox | 4-tier security |
| — | Skills integration | Anthropic Agent Skills marketplace |

## Tasks

- [ ] Rewrite README hero section with simpler framing: "50+ tools → 2-3 tools"
- [ ] Add a "Before/After" code comparison like Concierge does
- [ ] Add concrete metrics visuals (token savings chart, response time chart)
- [ ] Frame `find`/`code`/`run` as the three primitives (like Concierge frames stages/transitions/state)
- [ ] Add side-by-side: "What AI sees without NCP" vs "What AI sees with NCP"
- [ ] Consider a comparison section positioning NCP against Concierge directly

## Priority

Medium — NCP's product is stronger, but Concierge's communication is cleaner. Closing this gap increases adoption.
