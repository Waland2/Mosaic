import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import { arrayToMarkdownTable, textToArray } from "utils";
import { HelloPluginSettings, DEFAULT_SETTINGS } from "./settings";

export default class HelloPlugin extends Plugin {
    settings: HelloPluginSettings;

    async onload() {
        await this.loadSettings();

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
                    .map((row, i) => [ (i+1).toString(), ...row ]);
                editor.replaceSelection(arrayToMarkdownTable(array));
            }
        });

        this.addSettingTab(new HelloSettingTab(this.app, this));
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class HelloSettingTab extends PluginSettingTab {
    plugin: HelloPlugin;

    constructor(app: App, plugin: HelloPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

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
