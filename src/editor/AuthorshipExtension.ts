import {
  StateField,
  StateEffect,
  type Transaction,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import { SourceType } from "../types";
import type { AuthorshipRange } from "../types";
import {
  adjustRangesForInsert,
  adjustRangesForDelete,
  mergeAdjacentRanges,
  removeEmptyRanges,
} from "../core/RangeManager";
import { classifyTransaction } from "./InputDetector";

export const setAuthorshipRanges = StateEffect.define<AuthorshipRange[]>();
export const markSelectionAs = StateEffect.define<{
  from: number;
  to: number;
  sourceType: SourceType;
  authorName: string;
}>();
export const toggleAuthorship = StateEffect.define<boolean>();
export const updateAuthorshipSettings = StateEffect.define<{
  enabled: boolean;
  defaultPasteSource: SourceType;
  selfAuthorName: string;
}>();

interface AuthorshipFieldState {
  readonly ranges: readonly AuthorshipRange[];
  readonly enabled: boolean;
  readonly defaultPasteSource: SourceType;
  readonly selfAuthorName: string;
}

const INITIAL_STATE: AuthorshipFieldState = {
  ranges: [],
  enabled: true,
  defaultPasteSource: SourceType.PASTED,
  selfAuthorName: "Self",
};

interface ChangeSpan {
  readonly fromA: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
}

function collectChanges(tr: Transaction): ChangeSpan[] {
  const spans: ChangeSpan[] = [];
  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    spans.push({ fromA, toA, fromB, toB });
  });
  return spans;
}

function processDocChanges(
  state: AuthorshipFieldState,
  tr: Transaction,
): AuthorshipFieldState {
  if (!tr.docChanged || !state.enabled) return state;

  const sourceType = classifyTransaction(tr, state.defaultPasteSource);
  if (sourceType === null) return state;

  const authorName =
    sourceType === SourceType.SELF
      ? state.selfAuthorName
      : sourceType === SourceType.AI
        ? "AI"
        : "Pasted";

  const spans = collectChanges(tr);
  let ranges = [...state.ranges];

  let offset = 0;
  for (const span of spans) {
    const adjustedFrom = span.fromA + offset;
    const deleteLen = span.toA - span.fromA;
    const insertLen = span.toB - span.fromB;

    if (deleteLen > 0) {
      ranges = adjustRangesForDelete(ranges, adjustedFrom, deleteLen);
    }
    if (insertLen > 0) {
      ranges = adjustRangesForInsert(
        ranges,
        adjustedFrom,
        insertLen,
        sourceType,
        authorName,
      );
    }

    offset += insertLen - deleteLen;
  }

  ranges = removeEmptyRanges(ranges);
  ranges = mergeAdjacentRanges(ranges);

  return { ...state, ranges };
}

function processEffects(
  state: AuthorshipFieldState,
  tr: Transaction,
): AuthorshipFieldState {
  let current = state;

  for (const effect of tr.effects) {
    if (effect.is(setAuthorshipRanges)) {
      current = { ...current, ranges: effect.value };
    }
    if (effect.is(toggleAuthorship)) {
      current = { ...current, enabled: effect.value };
    }
    if (effect.is(updateAuthorshipSettings)) {
      current = {
        ...current,
        enabled: effect.value.enabled,
        defaultPasteSource: effect.value.defaultPasteSource,
        selfAuthorName: effect.value.selfAuthorName,
      };
    }
    if (effect.is(markSelectionAs)) {
      const { from, to, sourceType, authorName } = effect.value;
      const selFrom = Math.min(from, to);
      const selTo = Math.max(from, to);
      const length = selTo - selFrom;

      const newRanges = current.ranges.flatMap((r) => {
        const rangeEnd = r.from + r.length;

        if (r.from >= selTo || rangeEnd <= selFrom) return [r];
        if (r.from >= selFrom && rangeEnd <= selTo) return [];

        const result: AuthorshipRange[] = [];
        if (r.from < selFrom) {
          result.push({ ...r, length: selFrom - r.from });
        }
        if (rangeEnd > selTo) {
          result.push({ ...r, from: selTo, length: rangeEnd - selTo });
        }
        return result;
      });

      const markedRange: AuthorshipRange = {
        from: selFrom,
        length,
        sourceType,
        authorName,
      };

      const withMarked = [...newRanges, markedRange].sort(
        (a, b) => a.from - b.from,
      );

      current = {
        ...current,
        ranges: mergeAdjacentRanges(removeEmptyRanges(withMarked)),
      };
    }
  }

  return current;
}

export const authorshipField = StateField.define<AuthorshipFieldState>({
  create() {
    return INITIAL_STATE;
  },

  update(state, tr) {
    let next = processEffects(state, tr);
    next = processDocChanges(next, tr);
    return next;
  },

  provide(field) {
    return EditorView.decorations.from(field, (state) => {
      if (!state.enabled) return Decoration.none;
      return buildDecorations(state.ranges);
    });
  },
});

const decorationCache = new Map<string, Decoration>();

function getDecoration(sourceType: SourceType): Decoration {
  const cached = decorationCache.get(sourceType);
  if (cached) return cached;

  const dec = Decoration.mark({
    class: `authorship-${sourceType}`,
  });
  decorationCache.set(sourceType, dec);
  return dec;
}

function buildDecorations(
  ranges: readonly AuthorshipRange[],
): DecorationSet {
  const decorations = ranges
    .filter((r) => r.length > 0 && r.sourceType !== SourceType.SELF)
    .map((r) => getDecoration(r.sourceType).range(r.from, r.from + r.length));

  return Decoration.set(decorations, true);
}

export const authorshipTheme = EditorView.baseTheme({
  ".authorship-ai": {
    background:
      "linear-gradient(90deg, rgba(167,139,250,0.13), rgba(244,114,182,0.13), rgba(56,189,248,0.13))",
    borderRadius: "2px",
  },
  ".authorship-pasted": {
    opacity: "0.75",
    borderBottom: "1px dashed var(--text-muted)",
  },
  ".authorship-reference": {
    fontStyle: "italic",
    opacity: "0.6",
  },
});

export function createAuthorshipExtension(): Extension {
  return [authorshipField, authorshipTheme];
}
