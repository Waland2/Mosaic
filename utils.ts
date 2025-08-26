import { TABLE_SEPARATORS } from "./constants";

export function arrayToMarkdownTable(rows: string[][]): string {
    if (!rows || rows.length === 0) {
        return "";
    }
    let table = "| " + rows[0].join(" | ") + " |\n";
    table += "| " + rows[0].map(() => "---").join(" | ") + " |\n";
    for (let i = 1; i < rows.length; i++) {
        table += "| " + rows[i].join(" | ") + " |\n";
    }
    return table.trim();
}

export function textToArray(text: string): string[][] {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const separator = TABLE_SEPARATORS
        .map(sep => ({
            sep,
            score: lines.reduce((acc, l) => acc + (l.split(sep).length - 1), 0)
        }))
        .sort((a, b) => b.score - a.score)[0]?.sep ?? TABLE_SEPARATORS[0];
    const tableRows = lines.map(line => line.split(separator).map(c => c.trim()));
    return tableRows;
}