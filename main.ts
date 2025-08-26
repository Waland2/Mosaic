import { App, Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { arrayToMarkdownTable, textToArray } from "utils";

export default class HelloPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "insert-table-from-selection",
			name: "Insert Table from Selection",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				if (!selectedText) return;
				editor.replaceSelection(arrayToMarkdownTable(textToArray(selectedText)));
			}
		});

		this.addCommand({
			id: "insert-numbered-table-from-selection",
			name: "Insert Numbered Table from Selection",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				if (!selectedText) return;
				const array = textToArray(selectedText).map((row, i) => [...[(i + 1).toString()], ...row]);
				editor.replaceSelection(arrayToMarkdownTable(array));
			}
		});
	}

	onunload() {
	}
}
