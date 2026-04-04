import { Plugin, Notice, MarkdownView, TFile, debounce } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { DEFAULT_SETTINGS } from "./types";
import type { AuthorshipPluginSettings } from "./types";
import {
  createAuthorshipExtension,
  setAuthorshipRanges,
  updateAuthorshipSettings,
  authorshipField,
} from "./editor/AuthorshipExtension";
import { computeAuthorStats } from "./editor/AuthorshipDecorator";
import { loadAnnotations, saveAnnotations } from "./annotations/AnnotationStore";
import { extractAnnotationBlock } from "./annotations/AnnotationParser";
import { registerCommands } from "./commands";
import { AuthorshipSettingTab } from "./ui/SettingsTab";
import { StatusBarManager } from "./ui/StatusBarItem";

export default class AuthorshipPlugin extends Plugin {
  settings: AuthorshipPluginSettings = DEFAULT_SETTINGS;
  private statusBar: StatusBarManager | null = null;
  private settingsTab: AuthorshipSettingTab | null = null;
  private savingInProgress = new Set<string>();

  async onload(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };

    this.registerEditorExtension(createAuthorshipExtension());
    registerCommands(this);

    this.settingsTab = new AuthorshipSettingTab(
      this.app,
      this,
      this.settings,
      async (newSettings) => {
        this.settings = newSettings;
        this.settingsTab?.updateSettings(newSettings);
        await this.saveData(newSettings);
        this.syncSettingsToEditors();
      },
    );
    this.addSettingTab(this.settingsTab);

    if (this.settings.showInStatusBar) {
      this.statusBar = new StatusBarManager(this);
    }

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) this.handleFileOpen(file.path);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.debouncedStatusBarUpdate();
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && !this.savingInProgress.has(file.path)) {
          this.debouncedSave(file);
        }
      }),
    );
  }

  onunload(): void {
    this.statusBar = null;
  }

  private async handleFileOpen(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    const view = this.getActiveEditorView();
    if (!view) return;

    try {
      const content = await this.app.vault.read(file);
      const result = await loadAnnotations(content);

      if (result.hasAnnotations && !result.hashValid) {
        new Notice(
          "Authorship: Annotations may be misaligned. " +
            "The file was modified outside Obsidian.",
          8000,
        );
      }

      view.dispatch({
        effects: setAuthorshipRanges.of(result.ranges),
      });
    } catch {
      view.dispatch({
        effects: setAuthorshipRanges.of([]),
      });
    }
  }

  private async handleSave(file: TFile): Promise<void> {
    if (this.savingInProgress.has(file.path)) return;

    const view = this.getActiveEditorView();
    if (!view) return;

    const state = view.state.field(authorshipField, false);
    if (!state || state.ranges.length === 0) return;

    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView || mdView.file?.path !== file.path) return;

    try {
      const content = await this.app.vault.read(file);
      const extracted = extractAnnotationBlock(content);
      const body = extracted ? extracted.body : content;

      const withAnnotations = await saveAnnotations(body, state.ranges);

      this.savingInProgress.add(file.path);
      await this.app.vault.modify(file, withAnnotations);
      this.savingInProgress.delete(file.path);
    } catch {
      this.savingInProgress.delete(file.path);
    }
  }

  private debouncedSave = debounce(
    (file: TFile) => this.handleSave(file),
    2000,
    true,
  );

  private debouncedStatusBarUpdate = debounce(
    () => this.updateStatusBar(),
    500,
    true,
  );

  private updateStatusBar(): void {
    if (!this.statusBar || !this.settings.showInStatusBar) return;

    const view = this.getActiveEditorView();
    if (!view) {
      this.statusBar.hide();
      return;
    }

    const state = view.state.field(authorshipField, false);
    if (!state) {
      this.statusBar.hide();
      return;
    }

    const stats = computeAuthorStats(state.ranges);
    this.statusBar.update(stats);
  }

  private syncSettingsToEditors(): void {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const mdView = leaf.view as MarkdownView;
      // @ts-expect-error accessing internal CM6 editor
      const cmEditor = mdView.editor?.cm as EditorView | undefined;
      if (cmEditor) {
        cmEditor.dispatch({
          effects: updateAuthorshipSettings.of({
            enabled: this.settings.enabled,
            defaultPasteSource: this.settings.defaultPasteSource,
            selfAuthorName: this.settings.selfAuthorName,
          }),
        });
      }
    }
  }

  private getActiveEditorView(): EditorView | null {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return null;
    // @ts-expect-error accessing internal CM6 editor
    return mdView.editor?.cm ?? null;
  }
}
