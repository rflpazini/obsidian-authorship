import { PluginSettingTab, Setting, App } from "obsidian";
import type { AuthorshipPluginSettings } from "../types";
import { SourceType } from "../types";

export class AuthorshipSettingTab extends PluginSettingTab {
  private settings: AuthorshipPluginSettings;
  private readonly onSave: (settings: AuthorshipPluginSettings) => void;

  constructor(
    app: App,
    plugin: import("obsidian").Plugin,
    settings: AuthorshipPluginSettings,
    onSave: (settings: AuthorshipPluginSettings) => void,
  ) {
    super(app, plugin);
    this.settings = settings;
    this.onSave = onSave;
  }

  updateSettings(settings: AuthorshipPluginSettings): void {
    this.settings = settings;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable authorship tracking")
      .setDesc("Track typed vs pasted text in your documents")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.enabled).onChange((value) => {
          this.onSave({ ...this.settings, enabled: value });
        }),
      );

    new Setting(containerEl)
      .setName("Author name")
      .setDesc("Your name as it appears in authorship annotations")
      .addText((text) =>
        text
          .setPlaceholder("Self")
          .setValue(this.settings.selfAuthorName)
          .onChange((value) => {
            this.onSave({ ...this.settings, selfAuthorName: value || "Self" });
          }),
      );

    new Setting(containerEl)
      .setName("Default paste source")
      .setDesc("How pasted text is classified by default")
      .addDropdown((dropdown) =>
        dropdown
          .addOption(SourceType.PASTED, "Pasted (neutral)")
          .addOption(SourceType.AI, "AI")
          .addOption(SourceType.REFERENCE, "Reference")
          .setValue(this.settings.defaultPasteSource)
          .onChange((value) => {
            this.onSave({
              ...this.settings,
              defaultPasteSource: value as SourceType,
            });
          }),
      );

    new Setting(containerEl)
      .setName("Show in status bar")
      .setDesc("Display per-author character counts in the status bar")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.showInStatusBar)
          .onChange((value) => {
            this.onSave({ ...this.settings, showInStatusBar: value });
          }),
      );
  }
}
