import type { Plugin, Editor, MarkdownView, MarkdownFileInfo } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { SourceType } from "../types";
import {
  markSelectionAs,
  toggleAuthorship,
  authorshipField,
} from "../editor/AuthorshipExtension";

function getCmEditor(ctx: MarkdownView | MarkdownFileInfo): EditorView | null {
  // @ts-expect-error accessing internal CM6 editor
  return (ctx as MarkdownView).editor?.cm ?? null;
}

export function registerCommands(plugin: Plugin): void {
  plugin.addCommand({
    id: "mark-as-ai",
    name: "Mark selection as AI",
    editorCallback: (_editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
      markSelection(ctx, SourceType.AI, "AI");
    },
  });

  plugin.addCommand({
    id: "mark-as-self",
    name: "Mark selection as self",
    editorCallback: (_editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
      markSelection(ctx, SourceType.SELF, "Self");
    },
  });

  plugin.addCommand({
    id: "mark-as-reference",
    name: "Mark selection as reference",
    editorCallback: (_editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
      markSelection(ctx, SourceType.REFERENCE, "Reference");
    },
  });

  plugin.addCommand({
    id: "toggle-highlighting",
    name: "Toggle highlighting",
    callback: () => {
      const leaves = plugin.app.workspace.getLeavesOfType("markdown");
      for (const leaf of leaves) {
        const cmEditor = getCmEditor(leaf.view as MarkdownView);
        if (cmEditor) {
          const current = cmEditor.state.field(authorshipField).enabled;
          cmEditor.dispatch({
            effects: toggleAuthorship.of(!current),
          });
        }
      }
    },
  });
}

function markSelection(
  ctx: MarkdownView | MarkdownFileInfo,
  sourceType: SourceType,
  authorName: string,
): void {
  const cmEditor = getCmEditor(ctx);
  if (!cmEditor) return;

  const { from, to } = cmEditor.state.selection.main;
  if (from === to) return;

  cmEditor.dispatch({
    effects: markSelectionAs.of({ from, to, sourceType, authorName }),
  });
}
