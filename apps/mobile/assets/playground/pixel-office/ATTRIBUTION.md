# Pixel Office assets

These files are a small, modified subset of the **Pixel Office 32x32** asset pack (v1.1, PNG sheets). It was purchased for Thinketh, and its creator permits modified assets in commercial projects.

- `agent-coral.png` (Stefen): from `Characters/Characters.png`, rows 2–3, recoloured to deep brown skin and black hair.
- `agent-blue.png` (Nadani): from `Characters/Characters.png`, rows 4–5, recoloured to deep brown skin, with her top in Nadani's blue and the skirt in charcoal.
- `door.png`: from `Environment/Door List.png`.
- `window.png`: from `Environment/Environment.png`.
- `plant.png`: from `Props/Props.png`.

**How the files were modified:**
- The two characters were recoloured to represent Stefen and Nadani, who are both Black. The exact colour mapping is in `assets.ts`.
- Each character's idle frames and stepping frames were combined into one horizontal strip.
- The props were cropped to their visible pixels.
- Everything was scaled ×6 with nearest-neighbour scaling.

The exact source coordinates are in `src/components/playground/world/assets.ts`.

The full pack, including the Unity package and the unused sheets, is **not** committed. Neither is the Kenney Tiny Town pack that shipped in the same archive; it isn't used.
