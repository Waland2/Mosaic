import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, requireApiVersion, TFile, TFolder } from "obsidian";
import { arrayToMarkdownTable, decryptText, encryptText, looksLikeEncryptedPayload, textToArray } from "utils";
import { HelloPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { FolderPickerModal, PassphraseModal } from "modals";
import { TEXT_EXTS } from "./constants";

import { registerTableLayout } from "./table-layout";

export default class MosaicPlugin extends Plugin {
    settings: HelloPluginSettings;

    setTableLayoutEnabled: (enabled: boolean) => void;

    async onload() {
        await this.loadSettings();
        if (requireApiVersion("1.5.0")) {
            this.setTableLayoutEnabled = registerTableLayout(this, this.settings.enhancedTables);
        }

        this.addCommand({
            id: "insert-table-from-selection",
            name: "Insert Table from Selection",
            editorCallback: (editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText) return;
                editor.replaceSelection(
                    arrayToMarkdownTable(textToArray(selectedText, this.settings.tableSeparators))
                );
            }
        });

        this.addCommand({
            id: "insert-numbered-table-from-selection",
            name: "Insert Numbered Table from Selection",
            editorCallback: (editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText) return;
                const array = textToArray(selectedText, this.settings.tableSeparators)
                    .map((row, i) => [(i + 1).toString(), ...row]);
                editor.replaceSelection(arrayToMarkdownTable(array));
            }
        });

        this.addSettingTab(new MosaicSettingTab(this.app, this));
        this.addCommand({
            id: "encrypt-file-by-key",
            name: "Encrypt File by Key",
            editorCallback: async (_editor: Editor, view: MarkdownView) => {
                const file = view?.file;
                if (!file) {
                    new Notice("No active file");
                    return;
                }
                const pass = await new PassphraseModal(this.app, "Encrypt File").openAndGet();
                if (!pass) return;

                try {
                    const content = await this.app.vault.read(file);
                    const encrypted = encryptText(content, pass);
                    await this.app.vault.modify(file, encrypted);
                    new Notice(`File encrypted: ${file.basename}`);
                } catch (e: any) {
                    console.error(e);
                    new Notice(`Encryption error: ${e?.message ?? e}`);
                }
            }
        });

        this.addCommand({
            id: "decrypt-file-by-key",
            name: "Decrypt File by Key",
            editorCallback: async (_editor: Editor, view: MarkdownView) => {
                const file = view?.file;
                if (!file) {
                    new Notice("No active file");
                    return;
                }
                const pass = await new PassphraseModal(this.app, "Decrypt File").openAndGet();
                if (!pass) return;

                try {
                    const content = await this.app.vault.read(file);
                    const isPayloadLike = looksLikeEncryptedPayload(content);
                    if (!isPayloadLike) {
                        new Notice("File does not look like an encrypted payload");
                        return;
                    }
                    const decrypted = decryptText(content, pass);
                    await this.app.vault.modify(file, decrypted);
                    new Notice(`File decrypted: ${file.basename}`);
                } catch (e: any) {
                    console.error(e);
                    new Notice(`Decryption error: ${e?.message ?? e}`);
                }
            }
        });

        this.addCommand({
            id: "encrypt-folder-by-key",
            name: "Encrypt Folder by Key",
            callback: async () => {
                const folderPath = await this.pickFolder("Encrypt Folder");
                if (!folderPath) return;
                const pass = await new PassphraseModal(this.app, "Encrypt Folder").openAndGet();
                if (!pass) return;

                await this.processFolder(folderPath, async (file, content) => {
                    if (looksLikeEncryptedPayload(content)) return null;
                    return encryptText(content, pass);
                }, "encryped");
            }
        });

        this.addCommand({
            id: "decrypt-folder-by-key",
            name: "Decrypt Folder by Key",
            callback: async () => {
                const folderPath = await this.pickFolder("Decrypt Folder");
                if (!folderPath) return;
                const pass = await new PassphraseModal(this.app, "Decrypt Folder").openAndGet();
                if (!pass) return;

                await this.processFolder(folderPath, async (_file, content) => {
                    if (!looksLikeEncryptedPayload(content)) return null; // пропускаем незашифрованные
                    try {
                        return decryptText(content, pass);
                    } catch {
                        return null;
                    }
                }, "decrypted");
            }
        });
    }

    onunload() { }

    private async pickFolder(title: string): Promise<string | null> {
        const folders = this.collectAllFolderPaths();
        if (folders.length === 0) {
            new Notice("No folders found in vault");
            return null;
        }
        const picked = await new FolderPickerModal(this.app, title, folders).openAndGet();
        const af = this.app.vault.getAbstractFileByPath(picked ?? "");
        if (!(af instanceof TFolder)) {
            new Notice("Selected path is not a folder");
            return null;
        }
        return picked!;
    }

    private collectAllFolderPaths(): string[] {
        const res: string[] = [];
        const walk = (folder: TFolder) => {
            res.push(folder.path);
            for (const child of folder.children) {
                if (child instanceof TFolder) walk(child);
            }
        };
        walk(this.app.vault.getRoot());
        return res;
    }

    private collectTextFiles(folder: TFolder): TFile[] {
        const files: TFile[] = [];
        const walk = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFolder) {
                    walk(child);
                } else if (child instanceof TFile) {
                    const ext = child.extension?.toLowerCase();
                    if (TEXT_EXTS.has(ext)) files.push(child);
                }
            }
        };
        walk(folder);
        return files;
    }

    private async processFolder(
        folderPath: string,
        mapContent: (file: TFile, content: string) => Promise<string | null>,
        verbPast: "encryped" | "decrypted"
    ) {
        const af = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(af instanceof TFolder)) {
            new Notice("Selected path is not a folder");
            return;
        }

        const files = this.collectTextFiles(af);
        if (files.length === 0) {
            new Notice("No text files found in selected folder");
            return;
        }

        let changed = 0;
        let skipped = 0;

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const mapped = await mapContent(file, content);
                if (mapped === null || mapped === content) {
                    skipped++;
                    continue;
                }
                await this.app.vault.modify(file, mapped);
                changed++;
            } catch (e) {
                console.error(`Error processing ${file.path}`, e);
                skipped++;
            }
        }

        new Notice(
            `Folder ${verbPast}: ${changed} modified, ${skipped} skipped (${files.length} total) — ${af.path || "/"}`
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class MosaicSettingTab extends PluginSettingTab {
    plugin: MosaicPlugin;

    constructor(app: App, plugin: MosaicPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        const supportsTables = requireApiVersion("1.5.0");
        new Setting(containerEl)
            .setName("Enhanced Markdown tables")
            .setDesc(supportsTables
                ? "Resize tables and columns, center tables, and merge or split cells in Live Preview."
                : "Enhanced Markdown tables require Obsidian 1.5 or later.")
            .addToggle(toggle => toggle
                .setValue(supportsTables && this.plugin.settings.enhancedTables)
                .setDisabled(!supportsTables)
                .onChange(async enabled => {
                    this.plugin.settings.enhancedTables = enabled;
                    this.plugin.setTableLayoutEnabled(enabled);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Table separators")
            .setDesc("Characters used to split text into table cells")
            .addTextArea(text =>
                text
                    .setValue(this.plugin.settings.tableSeparators.join(", "))
                    .onChange(async (value) => {
                        this.plugin.settings.tableSeparators = value.split(",").map(s => s.trim()).filter(s => s.length);
                        await this.plugin.saveSettings();
                    })
            );
    }
}
