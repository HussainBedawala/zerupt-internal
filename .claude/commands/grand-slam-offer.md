---
description: Build a Grand Slam Offer using Alex Hormozi's $100M Offers framework. Reads your product specs, interviews you through every phase of the book, and outputs a complete offer document.
---

# Grand Slam Offer Builder

You are about to build a Grand Slam Offer — the exact process Alex Hormozi teaches in "$100M Offers."

## Step 1: Load the Skill

Run `Skill(grand-slam-offer)` to load the full interview protocol and framework knowledge.

## Step 2: Gather Business Context

Check if an `agent-os/` folder exists in the current working directory:

```
Glob: agent-os/**/*.md
```

**If files are found:**
1. Read all product spec files (mission, ICP, features, roadmap, pricing, etc.)
2. Synthesize into a business context summary
3. Present to the user via AskUserQuestion — let them confirm or correct your understanding
4. Proceed to Phase 1

**If NO agent-os/ folder exists:**
1. Tell the user: "No product specs found. I'll interview you to understand your business first."
2. Run the pre-prep interview from the skill's Phase 0 protocol (2 rounds of AskUserQuestion)
3. Synthesize answers into a business context summary
4. Proceed to Phase 1

## Step 3: Run the Interview Phases

Execute each phase sequentially. For each phase:
1. Read the relevant resource file from `.claude/skills/grand-slam-offer/resources/`
2. Use AskUserQuestion to interview the user
3. Record their answers internally (you'll need them for the output)
4. Move to the next phase

The phases (in order):
1. **Starving Crowd** — Market selection (01-starving-crowd.md)
2. **Niche Down** — Specific niche definition (02-niche-down.md)
3. **Pricing** — Value-based pricing (03-pricing.md)
4. **Value Equation** — All 4 variables (04-08 resources)
5. **Problems & Solutions** — Exhaustive brainstorm (09-problems-solutions.md)
6. **Delivery Vehicles** — Map solutions to vehicles (10-delivery-vehicles.md)
7. **Trim & Stack** — Build the offer stack (uses phase 5+6 data)
8. **Enhancers** — Scarcity, urgency, bonuses, guarantees (11-enhancers.md)
9. **Naming** — MAGIC formula (12-naming.md)

## Step 4: Save the Output

1. Ask the user where to save the output file via AskUserQuestion:
   - Option 1: `agent-os/offers/grand-slam-offer.md` (if agent-os exists)
   - Option 2: `grand-slam-offer.md` (project root)
   - Option 3: Custom path
2. Write the complete Grand Slam Offer document using the output template from the skill

## Important Reminders

- **ONLY use $100M Offers frameworks.** No generic marketing advice.
- **Use AskUserQuestion for EVERY phase.** This is an interactive interview.
- **Be Hormozi.** Direct, confident, no-BS. Push the founder to think harder.
- **Be exhaustive in Phase 5.** 20+ problems minimum.
- **The output must be hyper-specific.** No placeholders, no templates, no "fill in later."
