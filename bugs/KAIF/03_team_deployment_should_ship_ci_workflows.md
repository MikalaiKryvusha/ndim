# KAIF improvement request: /team-deployment should ship CI (GitHub Workflows) with the team

kaif-fp: skill:team-deployment#deliverables :: ci-not-shipped :: v2.4
**Autocapture** (from `.kaif/kaif.json`): KAIF 2.4 · project NDim Space · sphere programming ·
language ru · i18n translated · tracking origin · agent system claude-code (Claude Code /
Opus 5) · OS Windows 11 · Node 24.15.0
**Dedup attestation:** searched `bugs/KAIF/` (no CI/workflow ticket) and origin issues
(`gh issue list --repo MikalaiKryvusha/KAIF --state open --search "CI workflows"` → 0 rows,
full `--state all --limit 8` reviewed). No match found.
**Owner's order (verbatim, chat 2026-08-28):** «*если не было, не поставил — заводи в KAIF
запрос на импрувмент. Должен поставлять вместе с деплойментом команды*».

## Gap

`/team-deployment` (KAIF 2.4) deploys a multi-agent team around a shared git repository —
role worktrees, role branches, a merge gate held by the Manager — but ships **no CI**: no
GitHub Workflows (or any server-side check) that runs the project's cheap gates (unit tests,
lint, typecheck) on every push/PR of a role branch. Verified in the field: after deploying the
canon team on NDim Space, `.github/workflows` does not exist, and neither the skill's three
templates nor the reference §1–16 mention CI at all.

## Why this matters for exactly THIS skill

A team of agents multiplies the number of writers pushing branches. The industry standard the
canon should lean on (DORA: trunk-based development capability) holds "main is always green"
with **machine-enforced** checks on the server, not with each agent's discipline. Without CI:

- a role's `[TESTED]` claim is verified only by the QA role re-running everything by hand —
  the QA judge burns session time on what a server does for free;
- the Manager's Tech Lead review of a locked-push branch has no independent green to lean on;
- a broken `main` is discovered by the NEXT agent's local run, i.e. after the damage.

Single-agent KAIF deployments can live on local gates (`kaif:check`, the deploy door). A TEAM
deployment is precisely the moment server CI starts paying for itself — which is why it
belongs in this skill's deliverables, not in the project's backlog.

## Proposal

Operation 3 of `/team-deployment` ("deploy: materialize") additionally materializes a minimal
CI workflow, adapted to the project's own commands (read them from `package.json` / the
project's build canon, do not hardcode):

```yaml
# .github/workflows/team-ci.yml (template sketch)
name: team-ci
on:
  push: { branches: ['main', '<role-branch-pattern>*'] }
  pull_request: { branches: ['main'] }
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: <unit-test command>
      - run: <lint command>
      - run: <typecheck command>
```

Constraints the template must state out loud:
- **cheap gates only** — no secrets, no emulators, no live-stand steps in CI; heavy dynamic
  checks stay local behind the stand lock (the canon already owns that door);
- the workflow is part of the Team Constitution's git process: a red CI on a role branch
  blocks the merge request the same way a missing QA verdict does;
- teams on non-GitHub remotes get the same job as a documented local pre-push script, so the
  capability degrades gracefully instead of silently.

## Field context

Found on the first day the team's git process was formalized per the owner's order (GitHub
flow: the role updates its branch to main, resolves conflicts itself, files a PR; the Manager
merges after the QA verdict — `researches/53` in the NDim Space repo). The process is exactly
the shape CI was invented for; the skill that deployed the team should have brought it.

## Delivery

Filed to origin: https://github.com/MikalaiKryvusha/KAIF/issues/29 (2026-08-28, via gh).
