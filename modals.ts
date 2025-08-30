import { App, Editor, MarkdownView, Notice, Plugin, Modal, Setting, TFile } from "obsidian";

export class PassphraseModal extends Modal {
    private resolve!: (value: string | null) => void;
    private inputEl!: HTMLInputElement;

    constructor(app: App, private titleText: string) {
        super(app);
    }

    onOpen() {
        this.titleEl.setText(this.titleText);

        const container = this.contentEl;
        new Setting(container)
            .setName("Passphrase")
            .addText((t) => {
                this.inputEl = t.inputEl;
                t.setPlaceholder("Enter passphrase…");
                this.inputEl.type = "password";
                this.inputEl.focus();
                this.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") this.submit();
                });
                return t;
            });

        new Setting(container)
            .addButton((b) =>
                b.setButtonText("OK")
                    .setCta()
                    .onClick(() => this.submit())
            )
            .addButton((b) =>
                b.setButtonText("Cancel").onClick(() => this.closeWith(null))
            );
    }

    private submit() {
        const v = this.inputEl.value?.trim();
        if (!v) {
            new Notice("Passphrase cannot be empty");
            return;
        }
        this.closeWith(v);
    }

    private closeWith(val: string | null) {
        this.close();
        this.resolve(val);
    }

    public async openAndGet(): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }
}


export class FolderPickerModal extends Modal {
    private resolve!: (value: string | null) => void;
    private dropdownEl!: HTMLSelectElement;

    constructor(app: App, private titleText: string, private folderPaths: string[]) {
        super(app);
    }

    onOpen() {
        this.titleEl.setText(this.titleText);
        const container = this.contentEl;

        new Setting(container)
            .setName("Folder")
            .setDesc("Choose a folder")
            .addDropdown((dd) => {
                this.dropdownEl = dd.selectEl;
                const normalized = this.folderPaths.map(p => (p === "" ? "/" : p));
                const sorted = [...normalized].sort((a, b) => a.localeCompare(b));
                for (const p of sorted) dd.addOption(p, p);
            });

        new Setting(container)
            .addButton((b) => b.setButtonText("OK").setCta().onClick(() => this.submit()))
            .addButton((b) => b.setButtonText("Cancel").onClick(() => this.closeWith(null)));
    }

    private submit() {
        const sel = this.dropdownEl?.value?.trim();
        if (!sel) {
            new Notice("Please choose a folder");
            return;
        }
        const finalPath = sel === "/" ? "" : sel;
        this.closeWith(finalPath);
    }

    private closeWith(val: string | null) {
        this.close();
        this.resolve(val);
    }

    public async openAndGet(): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }
}