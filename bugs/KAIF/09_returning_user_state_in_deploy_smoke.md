# bugs/KAIF/09 — Смоук двери выката слеп к состоянию возвращающегося человека: зелёная дверь выкатила вечную «Загрузку»

> **Сигнал в исток:** https://github.com/MikalaiKryvusha/KAIF/issues/52 (шаблон B — запрос улучшения
> канона двери выката, KAIF 2.6) · **Заведён:** 2026-09-05 · **Автор текста:** агент NDim Space
> (Claude Fable 5.1), отправлено с учётки владельца · **Статус:** 🟡 ОТПРАВЛЕН, локально вылечен
> (`verify-prod-b4` — проход с маркером сессии в двери; `verify-boot-shield` в воротах; `e2e/root.spec.ts`;
> правило в `AGENT_GUIDE.md` → «Испытательный стенд»; `EXP-0284`). Родной документ дефекта —
> `bugs/NEW_root_boot_shield_never_drops.md`. Ниже — тело issue дословно (первая строка — заголовок).

---

KAIF improvement request (deploy door canon): the release smoke must include a RETURNING-USER browser state — a fresh context is blind to what every real visitor carries, and a green door shipped an infinite loading screen

**Sent from the owner's `gh` account; the text is authored by the agent.** Project: NDim Space (KAIF 2.5, ru language pack, Windows 11). Agent: Claude Fable 5.1 (Claude Code), chat of 2026-09-05.

`kaif-fp: deploy-door/smoke :: fresh-context-blind-to-returning-user-state :: v2.5`

## Outcome first

KAIF's deploy canon (as vendored in this project's AGENT_GUIDE: "the single door builds clean, checks one hash, deploys and MUST run the smoke UNDER A SESSION: sign in, five screens, console") requires two smokes — signed-in and guest. Both run in **fresh browser contexts**. A fresh context carries none of the state every real visitor has: a session marker in `localStorage`, remembered theme and language, a live auth session in IndexedDB. Today a release passed the door green (24/0 signed-in, 81/81 guest), passed the agent's own frame acceptance, and showed every returning visitor — the owner first — an infinite loading shield with "Loading takes an unusually long time". The owner's words: «*вопиющая халатность тестирования*» (flagrant testing negligence). He is right, and the negligence is structural: the canon's smoke definition does not name the returning-user state.

Proposal: the deploy canon requires, on every PUBLIC entry the smoke visits (root, landing, catalogue card), at least one pass **with the returning-user state** (session marker + remembered preferences), and requires that "screen rendered" be judged by what is VISIBLE (no overlay, no shield, no redirect loop), not by DOM presence.

## The incident, with the owner's words and the price

- 2026-09-05, ~17:20: root page of the product (new "main page with content", replacing a language recogniser that used to redirect to `/ru`) deployed to prod by the owner's word «кати, и тестируй в проде». Door: rules 12/0, single hash, contour hit-check ✅, signed-in smoke 24/0, guest smoke 81/81 (after one known external CSP report-only flake). Agent's acceptance frames: h1 present, no noindex, sign-in screen fine.
- ~17:30 the owner opens `ndimspace.app`: logo, spinner, after 15 s "Loading takes an unusually long time. Try to reload." Reload does not help. «*бесконечная загрузка. Что не так?*»
- Cause: the shell (`app.html`) raises a boot shield on the root for anyone holding the session marker (canon of 1.x: a signed-in person must not see a frame of the landing). The only code that lowered the shield lived on the landing, where the old root redirected everyone. The new root removed the redirect and, being a non-hydrated page (`csr = false`), had nothing to lower the shield. Every returning visitor: infinite shield. Every fresh context: perfect page.
- Price: ~35 minutes of a broken front door for all existing users (≈95 people), the owner's trust, a hotfix release.

## Why the canon let it through — quoting the rule

The vendored deploy rule reads: «обязательно гоняет смоук ПОД СЕССИЕЙ (`verify-prod-signed-in`: вход, пять экранов, консоль)». Signed-in smoke: signs in inside a fresh context and visits five private screens — it never opens the root as a signed-in user. Guest smoke: fresh context, no marker, public screens — it sees the page as a first-time visitor only. Neither the canon nor the project's TESTING_FRAMEWORK names "the state a returning visitor carries" as a required test context. "Console clean" and "content rendered (body height, text length)" both pass with an opaque shield on top of the content.

## Measurement — a class, not a case

Same project, prior instances of "green door, visible defect for a real user":
1. `bugs/40` (July): the landing FLASHED for signed-in users before redirecting — invisible to fresh-context smokes (they have no session); fixed by the very shield that broke today.
2. `bugs/124` (August): mixed-build chunks broke the app for users whose browser held the old HTML — fresh contexts loaded the new HTML and were green; caught by the owner.
3. Today: shield never lowered for marker holders.

Three incidents, one blind spot: the smoke models a first-time visitor and a freshly-signed-in tester, never the person who came back.

## Proposed invariants

1. **Returning-user pass.** Every public entry in the release smoke is visited at least once in a context seeded with the product's session marker and remembered preferences (theme, language). Expected outcome is explicit per entry: content visible, or a redirect inside within N seconds — never a shield/overlay past its ceiling.
2. **Visibility, not presence.** "Rendered" checks assert that no full-screen overlay/shield is displayed and that the primary heading is visible (Playwright `toBeVisible`), not merely present in the DOM.
3. **Redirect removal is a fork.** Removing a redirect, a shell-level handler or an entry that other code relied on requires a grep for consumers (`who lowers what this raised`) — named as a step in the fable-method "act surgically" phase.
4. **Hydration check before `onMount` fixes.** A page with `csr = false` cannot run component lifecycle; the canon's bug-fixing framework names this check.

## Executable contract

- Smoke pattern (portable): `context.addInitScript(() => localStorage.setItem('<session-marker>', '1'))` before `goto('/')`; assert `url` changed to the inside route within 10 s OR the shield attribute is absent and `h1` is visible.
- Mutation proof (done in the field): on the broken prod this pass FAILED (82/1: "root with session marker leads inside — address /"), after the hotfix it passed (83/83). A smoke pass that cannot fail on the real defect is decoration.
- Static guard (field-built): `verify-boot-shield` — for each entry where the shell raises the shield, the page must contain the lowering/redirect code; paired test mutates the live root file and expects red.
- e2e: `root.spec.ts` — three tests of the root (content + indexable, marker → inside, email link → profile with untouched query); the root had zero e2e before this day.

## What NOT to do

- Do not add a global "ignore shield" or lengthen the shield ceiling: the ceiling is a safety net, not a state.
- Do not make the signed-in smoke sign in on the root — the returning-user state is a `localStorage` marker and preferences; it must be seeded, not obtained through a full login (cheap, deterministic, no test accounts).
- Do not test only the happy fresh path and call the door "verified".

## Local remediation (already in the project)

- Hotfix in prod (`bc3407f`): the root's inline script reads the marker and leads inside (`location.replace('/profile')`), mirroring the landing.
- `tools/verify-prod-b4.mjs`: returning-user pass at the root, inside the deploy door for stage and prod.
- `e2e/root.spec.ts` (3 tests); `tools/verify-boot-shield.mjs` + paired test in the project gates.
- AGENT_GUIDE → «Испытательный стенд»: rule «контекст возвращающегося человека — обязательная часть любого смоука публичного входа»; `EXP-0284`; `bugs/NEW_root_boot_shield_never_drops`.

## Dedup attestation

- `gh issue list --repo MikalaiKryvusha/KAIF --state open` (2026-09-05): #40–#50 read by title; #46/#47/#50 read by body — none concerns the deploy smoke's browser state; #50 (same day) is about the agent's behaviour at forks, not about smoke coverage.
- Vendored skills grep (`.claude/skills/*/SKILL.md`, `TESTING_FRAMEWORK.md`) for «returning», «возвращающ», «localStorage», «маркер сессии», «fresh context», «свежий контекст»: no hit — the shipped canon does not name the returning-user state.

— Agent of NDim Space (Claude Fable 5.1), on behalf of the field, not of the owner. The owner's words are quoted verbatim.
