import { MarkdownRenderChild, Menu, Notice, Plugin } from "obsidian";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

type Bounds = [number, number, number, number];

interface Layout {
	widths: number[];
	merges: Bounds[];
	tableWidth?: number;
	centered?: boolean;
	tableOffset?: number; // Legacy free-position offset.
}

const MARK = /<!--table-layout-v1:(.*?)-->/;
const DIVIDER = /^\s*(?:>\s*)*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const TABLE = ".cm-table-widget > .table-wrapper > table.table-editor";
const MIN = 48;
const movedHeaders = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();

function readLayout(line: string): Layout | null {
	const match = MARK.exec(line);
	if (!match) return { widths: [], merges: [] };
	try {
		const data = JSON.parse(match[1]);
		if (Array.isArray(data.widths) && Array.isArray(data.merges)) return data;
	} catch {}
	return null;
}

function validWidths(values: number[], count: number) {
	return values.length === count && values.every(n => Number.isFinite(n) && n > 0);
}

function overlaps(a: Bounds, b: Bounds) {
	return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function validMerges(merges: Bounds[], table: HTMLTableElement) {
	const result: Bounds[] = [];
	for (const box of merges) {
		if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isSafeInteger)) continue;
		const [top, left, bottom, right] = box;
		if (top < 0 || left < 0 || bottom < top || right < left || bottom >= table.rows.length) continue;
		const firstGroup = table.rows[top].parentNode;
		const lastGroup = table.rows[bottom].parentNode;
		if (firstGroup !== lastGroup && !(firstGroup === table.tHead && lastGroup === table.tBodies[0])) continue;
		if (Array.from(table.rows).slice(top, bottom + 1).some(row => right >= row.cells.length)) continue;
		if (!result.some(other => overlaps(other, box))) result.push(box);
	}
	return result;
}

function layoutEdit(line: string, data: Layout) {
	const old = MARK.exec(line);
	const marker = data.widths.length || data.merges.length || data.tableWidth || data.centered
		? "<!--table-layout-v1:" + JSON.stringify(data) + "-->" : "";
	if (old) return { from: old.index, to: old.index + old[0].length, insert: marker };
	const end = line.trimEnd();
	const last = end.endsWith("|") && !/(?:^|[^\\])(?:\\\\)*\\\|$/.test(end) ? end.length - 1 : end.length;
	return { from: last, to: last, insert: marker };
}

function writeWidths(table: HTMLTableElement, widths: number[]) {
	let group = table.querySelector<HTMLTableColElement>(":scope > colgroup.mosaic-tl-columns");
	if (!group || group.children.length !== widths.length) {
		group?.remove();
		group = table.ownerDocument.createElement("colgroup");
		group.className = "mosaic-tl-columns";
		for (const width of widths) group.appendChild(table.ownerDocument.createElement("col"));
		table.prepend(group);
	}
	const total = widths.reduce((a, b) => a + b, 0);
	Array.from(group.children).forEach((col, i) => {
		(col as HTMLTableColElement).style.width = (100 * widths[i] / total) + "%";
	});
	table.style.setProperty("--mosaic-tl-min", MIN * widths.length + "px");
}

function setTableLayout(table: HTMLTableElement, { tableWidth: width, centered }: Pick<Layout, "tableWidth" | "centered"> = {}) {
	const target = table.matches(TABLE) ? table.parentElement! : table;
	if (width !== undefined && Number.isFinite(width) && width > 0) target.style.setProperty("--mosaic-tl-table-width", width + "px");
	else target.style.removeProperty("--mosaic-tl-table-width");
	table.classList.toggle("mosaic-tl-centered", centered === true);
}

function clearTable(table: HTMLTableElement) {
	setTableLayout(table);
	if (table.matches(TABLE)) table.parentElement!.querySelectorAll(":scope > .mosaic-tl-table-grip").forEach(edge => edge.remove());
	table.querySelector(":scope > colgroup.mosaic-tl-columns")?.remove();
	for (const cell of Array.from(table.querySelectorAll(".mosaic-tl-anchor, .mosaic-tl-covered"))) {
		if (cell.closest("table") !== table) continue;
		cell.classList.remove("mosaic-tl-anchor", "mosaic-tl-covered");
		cell.removeAttribute("rowspan");
		cell.removeAttribute("colspan");
	}
	table.querySelectorAll(":scope > * > tr > * > .mosaic-tl-grip").forEach(el => el.remove());
	const headerRows = movedHeaders.get(table);
	if (headerRows) {
		for (const row of headerRows) table.tHead?.append(row);
		movedHeaders.delete(table);
	}
	if (table.matches(TABLE)) table.parentElement!.style.removeProperty("--mosaic-tl-wrapper-min");
	table.classList.remove("mosaic-tl-table");
	table.style.removeProperty("--mosaic-tl-min");
}

function applyTable(table: HTMLTableElement, data: Layout, editable: boolean) {
	clearTable(table);
	const count = table.rows[0]?.cells.length || 0;
	if (!count) return;
	table.classList.add("mosaic-tl-table");
	setTableLayout(table, data);
	writeWidths(table, validWidths(data.widths, count) ? data.widths : Array(count).fill(1));
	const merges = validMerges(data.merges, table);
	if (merges.some(([top, , bottom]) => table.rows[top].parentNode !== table.rows[bottom].parentNode)) {
		// HTML row spans end at a row group boundary. Keep the native th nodes
		// and their listeners while putting the spanned rows in the same group.
		const rows = Array.from(table.tHead!.rows);
		movedHeaders.set(table, rows);
		table.tBodies[0].prepend(...rows);
	}
	for (const box of merges) {
		const [top, left, bottom, right] = box;
		const anchor = table.rows[top].cells[left];
		anchor.classList.add("mosaic-tl-anchor");
		anchor.rowSpan = bottom - top + 1;
		anchor.colSpan = right - left + 1;
		for (let r = top; r <= bottom; r++) {
			for (let c = left; c <= right; c++) {
				if (r !== top || c !== left) table.rows[r].cells[c].classList.add("mosaic-tl-covered");
			}
		}
	}
	if (!editable) return;
	table.parentElement!.style.setProperty("--mosaic-tl-wrapper-min", MIN * count + "px");
	for (const side of ["start", "end"]) {
		const edge = table.ownerDocument.createElement("span");
		edge.className = "mosaic-tl-table-grip";
		edge.dataset.side = side;
		edge.contentEditable = "false";
		edge.title = "Drag to resize the table. Right-click for alignment. Double-click to restore full width.";
		table.parentElement!.append(edge);
	}
	for (const row of Array.from(table.rows)) {
		for (const cell of Array.from(row.cells)) {
			const boundary = cell.cellIndex + cell.colSpan;
			if (cell.classList.contains("mosaic-tl-covered") || boundary >= count) continue;
			const grip = table.ownerDocument.createElement("span");
			grip.className = "mosaic-tl-grip";
			grip.contentEditable = "false";
			grip.title = "Drag to resize the column";
			grip.dataset.boundary = String(boundary);
			cell.append(grip);
		}
	}
}

function headerAt(view: EditorView, table: HTMLTableElement) {
	const widget = table.closest(".cm-table-widget");
	if (!widget || !view.contentDOM.contains(widget)) return null;
	const doc = view.state.doc;
	const line = doc.lineAt(view.posAtDOM(widget));
	if (line.number < doc.lines && DIVIDER.test(doc.line(line.number + 1).text)) return line;
	return null;
}

class TableEditor {
	private readonly win: Window & typeof globalThis;
	private readonly cache = new Map<HTMLTableElement, string>();
	private readonly observer: MutationObserver;
	private readonly schedule: () => void;
	private readonly onContextMenu: (e: MouseEvent) => void;
	private readonly onDoubleClick: (e: MouseEvent) => void;
	private readonly onKey: (e: KeyboardEvent) => void;
	private frame = 0;
	private cancelDrag: (() => void) | null = null;
	private first: { table: HTMLTableElement; cell: HTMLTableCellElement; r: number; c: number } | null = null;

	constructor(private readonly view: EditorView) {
		this.win = view.dom.ownerDocument.defaultView!;
		this.onDown = this.onDown.bind(this);
		this.onDoubleClick = event => {
			const table = this.edgeTable(event);
			if (!table) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			const line = headerAt(this.view, table);
			const current = line && readLayout(line.text);
			if (current?.tableWidth) {
				delete current.tableWidth;
				this.save(table, current);
			}
		};
		this.onContextMenu = event => {
			const table = this.edgeTable(event);
			if (!table) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			const line = headerAt(this.view, table);
			const data = line && readLayout(line.text);
			if (!data) return;
			const menu = new Menu();
			menu.addItem(item => item.setTitle("Center table").setChecked(data.centered === true).onClick(() => {
				const header = headerAt(this.view, table);
				const current = header && readLayout(header.text);
				if (!current) return;
				if (current.centered) {
					delete current.centered;
				} else {
					current.centered = true;
				}
				this.save(table, current);
			}));
			menu.showAtMouseEvent(event);
		};
		view.dom.addEventListener("contextmenu", this.onContextMenu, true);
		view.dom.addEventListener("dblclick", this.onDoubleClick, true);
		this.onKey = e => { if (e.key === "Escape") { this.cancelDrag?.(); this.clearSelection(); } };
		this.schedule = () => {
			if (!this.frame) this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
		};
		this.observer = new this.win.MutationObserver(this.schedule);
		this.observer.observe(view.contentDOM, { childList: true, subtree: true });
		view.dom.addEventListener("pointerdown", this.onDown, true);
		this.win.addEventListener("keydown", this.onKey);
		this.schedule();
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged || update.geometryChanged) this.schedule();
	}

	refresh() {
		for (const table of this.cache.keys()) {
			if (!this.view.contentDOM.contains(table)) {
				this.cache.delete(table);
				if (this.first?.table === table) this.clearSelection();
			}
		}
		for (const table of Array.from(this.view.contentDOM.querySelectorAll<HTMLTableElement>(TABLE))) {
			if (table.closest(".cm-content") !== this.view.contentDOM) continue;
			const line = headerAt(this.view, table);
			if (!line) continue;
			const key = MARK.exec(line.text)?.[0] || "";
			if (this.cache.get(table) === key) continue;
			this.cache.set(table, key);
			const data = readLayout(line.text);
			if (data) applyTable(table, data, true);
			else clearTable(table);
		}
	}

	clearSelection() {
		this.first?.cell.classList.remove("mosaic-tl-first");
		this.first = null;
	}

	save(table: HTMLTableElement, data: Layout) {
		const line = headerAt(this.view, table);
		if (!line) return;
		// Older versions stored a free-position offset. Native alignment supersedes it.
		delete data.tableOffset;
		const edit = layoutEdit(line.text, data);
		this.view.dispatch({ changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert }, userEvent: "input.table-layout" });
	}

	edgeTable(event: MouseEvent) {
		const edge = (event.target as Element | null)?.closest(".mosaic-tl-table-grip");
		const table = edge?.parentElement?.querySelector<HTMLTableElement>(":scope > table.table-editor");
		return table && this.cache.has(table) ? table : null;
	}

	onDown(event: PointerEvent) {
		if (event.button !== 0 || !event.isPrimary) return;
		const whole = this.edgeTable(event);
		if (whole) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.clearSelection();
			this.resizeTable(event, whole);
			return;
		}
		const target = event.target as Element;
		const cell = target.closest<HTMLTableCellElement>("td, th");
		const table = cell?.closest("table");
		if (!cell || !table?.matches(TABLE) || !this.cache.has(table)) return;
		const grip = target.closest<HTMLElement>(".mosaic-tl-grip");
		if (!event.altKey && !grip) { this.clearSelection(); return; }
		const line = headerAt(this.view, table);
		const data = line && readLayout(line.text);
		if (!data) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (grip) {
			this.clearSelection();
			this.resize(event, table, Number(grip.dataset.boundary));
			return;
		}
		const r = (cell.parentElement as HTMLTableRowElement).rowIndex, c = cell.cellIndex;
		data.merges = validMerges(data.merges, table);
		const old = data.merges.find(b => b[0] === r && b[1] === c);
		if (old && !this.first) {
			data.merges = data.merges.filter(b => b !== old);
			this.save(table, data);
			return;
		}
		if (this.first?.table !== table) {
			this.clearSelection();
			this.first = { table, cell, r, c };
			cell.classList.add("mosaic-tl-first");
			new Notice("Alt/Option-click the opposite corner to merge cells. Press Escape to cancel.");
			return;
		}
		const first = this.first;
		this.clearSelection();
		if (first.cell === cell) return;
		const box: Bounds = [Math.min(r, first.r), Math.min(c, first.c), Math.max(r, first.r), Math.max(c, first.c)];
		if (validMerges([...data.merges, box], table).length === data.merges.length) {
			new Notice("Select a rectangle that does not overlap an existing merge.");
			return;
		}
		data.merges.push(box);
		this.save(table, data);
	}

	resizeTable(event: PointerEvent, table: HTMLTableElement) {
		this.cancelDrag?.();
		const line = headerAt(this.view, table);
		const original = line && readLayout(line.text);
		if (!original) return;
		const start = table.getBoundingClientRect().width;
		const minimum = MIN * table.rows[0].cells.length;
		const atStart = (event.target as HTMLElement).dataset.side === "start";
		const centered = original.centered === true;
		const wrapper = table.parentElement!;
		const restore = () => {
			wrapper.style.removeProperty("--mosaic-tl-drag-shift");
			setTableLayout(table, original);
		};
		let width = start;
		this.trackDrag(event, table, dx => {
			const change = (atStart ? -dx : dx) * (centered ? 2 : 1);
			width = Math.max(minimum, Math.round(start + change));
			if (atStart && !centered) wrapper.style.setProperty("--mosaic-tl-drag-shift", (start - width) + "px");
			setTableLayout(table, { tableWidth: width, centered });
		}, current => {
			wrapper.style.removeProperty("--mosaic-tl-drag-shift");
			if (Math.abs(width - start) < 0.51) {
				setTableLayout(table, original);
				return;
			}
			current.tableWidth = width;
			this.save(table, current);
		}, restore);
	}

	resize(event: PointerEvent, table: HTMLTableElement, boundary: number) {
		this.cancelDrag?.();
		const group = table.querySelector(":scope > .mosaic-tl-columns");
		if (!group) return;
		const start = Array.from(group.children, col => col.getBoundingClientRect().width);
		const left = boundary - 1, right = boundary;
		const min = Math.min(MIN, start[left], start[right]);
		const widths = start.slice();
		this.trackDrag(event, table, distance => {
			const dx = Math.max(min - start[left], Math.min(start[right] - min, distance));
			widths[left] = start[left] + dx;
			widths[right] = start[right] - dx;
			writeWidths(table, widths);
		}, current => {
			if (widths[left] === start[left]) return;
			current.widths = widths.map(n => Math.round(n * 100) / 100);
			this.save(table, current);
		}, () => writeWidths(table, start));
	}

	trackDrag(event: PointerEvent, table: HTMLTableElement, preview: (dx: number) => void,
		commit: (data: Layout) => void, restore: () => void) {
		const direction = this.win.getComputedStyle(table).direction === "rtl" ? -1 : 1;
		const widget = table.closest(".cm-table-widget");
		if (!widget) return;
		const startScroll = widget.scrollLeft;
		const move = (e: PointerEvent) => {
			if (e.pointerId !== event.pointerId) return;
			preview(direction * (e.clientX - event.clientX + widget.scrollLeft - startScroll));
		};
		const cleanup = () => {
			this.win.removeEventListener("pointermove", move, true);
			this.win.removeEventListener("pointerup", finish, true);
			this.win.removeEventListener("pointercancel", cancel, true);
			this.win.removeEventListener("blur", cancel);
			this.cancelDrag = null;
		};
		const cancel = () => { cleanup(); restore(); };
		const finish = (e: PointerEvent) => {
			if (e.pointerId !== event.pointerId) return;
			move(e);
			cleanup();
			const line = headerAt(this.view, table);
			const current = line && readLayout(line.text);
			if (current) commit(current);
			else restore();
		};
		this.cancelDrag = cancel;
		this.win.addEventListener("pointermove", move, true);
		this.win.addEventListener("pointerup", finish, true);
		this.win.addEventListener("pointercancel", cancel, true);
		this.win.addEventListener("blur", cancel);
	}

	destroy() {
		this.observer.disconnect();
		this.win.cancelAnimationFrame(this.frame);
		this.cancelDrag?.();
		this.clearSelection();
		this.view.dom.removeEventListener("contextmenu", this.onContextMenu, true);
		this.view.dom.removeEventListener("dblclick", this.onDoubleClick, true);
		this.view.dom.removeEventListener("pointerdown", this.onDown, true);
		this.win.removeEventListener("keydown", this.onKey);
		for (const table of this.cache.keys()) clearTable(table);
	}
}

// Keep one render child per native preview table so open reading views and embeds
// can respond to the setting without reopening the file or rewriting Markdown.
export function registerTableLayout(plugin: Plugin, enabled: boolean) {
	const editorExtension = ViewPlugin.fromClass(TableEditor);
	const extensions = enabled ? [editorExtension] : [];
	plugin.registerEditorExtension(extensions);

	const previews = new Map<HTMLTableElement, Layout>();
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const table = el.querySelector<HTMLTableElement>(":scope > table");
		if (!table || table.closest(".cm-table-widget")) return;
		const section = ctx.getSectionInfo(table);
		if (!section) return;
		const lines = section.text.split(/\r?\n/);
		if (!DIVIDER.test(lines[section.lineStart + 1] || "")) return;
		const data = readLayout(lines[section.lineStart]);
		if (!data) return;
		previews.set(table, data);
		if (enabled) applyTable(table, data, false);
		const child = new MarkdownRenderChild(table);
		child.register(() => {
			// A reused section may already have a newer render child.
			if (previews.get(table) !== data) return;
			previews.delete(table);
			if (enabled) clearTable(table);
		});
		ctx.addChild(child);
	});
	plugin.register(() => {
		if (enabled) for (const table of previews.keys()) clearTable(table);
		previews.clear();
	});

	return (next: boolean) => {
		if (next === enabled) return;
		enabled = next;
		extensions.length = 0;
		if (enabled) extensions.push(editorExtension);
		plugin.app.workspace.updateOptions();
		for (const [table, data] of previews) {
			if (enabled) applyTable(table, data, false);
			else clearTable(table);
		}
	};
}
