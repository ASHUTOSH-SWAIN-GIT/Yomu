import type { AgentModel } from "@/types/agent";

/** One model in the picker. Codex offers each model at several reasoning
 * efforts as separate ids; they are one entry here, with a variant each. */
export interface ModelEntry {
  key: string;
  title: string;
  description: string;
  variants: { id: string; label: string }[];
}

/** A group of entries: a provider (OpenCode), or no title at all (Codex). */
export interface ModelSection {
  title: string | null;
  entries: ModelEntry[];
}

/** "gpt-5.5[low]" -> { base: "gpt-5.5", effort: "low" }. */
function splitEffort(id: string): { base: string; effort: string | null } {
  const match = /^(.*)\[([^\]]+)\]$/.exec(id);
  return match
    ? { base: match[1], effort: match[2] }
    : { base: id, effort: null };
}

/** The first sentence: Codex descriptions continue with a sentence about the
 * effort, which the variants show instead. */
function firstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end === -1 ? text : text.slice(0, end + 1);
}

/** Arranges what the agent offers into what the picker shows: Codex's
 * effort variants folded into one entry per model, and OpenCode's
 * "Provider/Model" names split into a section per provider. Nothing is
 * dropped: the agent already lists only what the account can use. */
export function groupModels(models: AgentModel[]): ModelSection[] {
  const sections: ModelSection[] = [];
  const sectionFor = (title: string | null) => {
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, entries: [] };
      sections.push(section);
    }
    return section;
  };

  for (const model of models) {
    const { base, effort } = splitEffort(model.id);
    const slash = model.name.indexOf("/");
    const provider = slash > 0 ? model.name.slice(0, slash) : null;
    const section = sectionFor(provider);

    if (effort) {
      const key = base;
      let entry = section.entries.find((e) => e.key === key);
      if (!entry) {
        entry = {
          key,
          title: model.name.replace(new RegExp(`\\s*\\(${effort}\\)\\s*$`), ""),
          description: firstSentence(model.description),
          variants: [],
        };
        section.entries.push(entry);
      }
      entry.variants.push({ id: model.id, label: effort });
    } else {
      section.entries.push({
        key: model.id,
        title: provider ? model.name.slice(slash + 1) : model.name,
        description: model.description,
        variants: [{ id: model.id, label: "" }],
      });
    }
  }
  return sections;
}

/** Which variant a click on the entry itself picks: medium when offered,
 * otherwise the first. */
export function defaultVariant(entry: ModelEntry): string {
  return (entry.variants.find((v) => v.label === "medium") ?? entry.variants[0])
    .id;
}
