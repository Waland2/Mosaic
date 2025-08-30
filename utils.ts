import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";

export function arrayToMarkdownTable(rows: string[][]): string {
    if (!rows || rows.length === 0) return "";
    let table = "| " + rows[0].join(" | ") + " |\n";
    table += "| " + rows[0].map(() => "---").join(" | ") + " |\n";
    for (let i = 1; i < rows.length; i++) {
        table += "| " + rows[i].join(" | ") + " |\n";
    }
    return table.trim();
}

export function textToArray(text: string, separators: string[]): string[][] {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const separator = separators
        .map(sep => ({
            sep,
            score: lines.reduce((acc, l) => acc + (l.split(sep).length - 1), 0)
        }))
        .sort((a, b) => b.score - a.score)[0]?.sep ?? separators[0];
    return lines.map(line => line.split(separator).map(c => c.trim()));
}


export function encryptText(plaintext: string, passphrase: string): string {
    if (typeof plaintext !== "string") throw new TypeError("plaintext must be a string");
    if (!passphrase) throw new Error("passphrase is required");

    const version = "v1";
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(passphrase, salt, 32);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const b64 = (b: Buffer) => b.toString("base64");
    return [version, b64(salt), b64(iv), b64(tag), b64(ciphertext)].join(":");
}

export function decryptText(payload: string, passphrase: string): string {
    if (!payload || typeof payload !== "string") throw new TypeError("payload must be a non-empty string");
    if (!passphrase) throw new Error("passphrase is required");

    const parts = payload.split(":");
    if (parts.length !== 5) throw new Error("Invalid payload format");
    const [version, saltB64, ivB64, tagB64, ctB64] = parts;
    if (version !== "v1") throw new Error(`Unsupported version: ${version}`);

    const fromB64 = (s: string) => Buffer.from(s, "base64");
    const salt = fromB64(saltB64);
    const iv = fromB64(ivB64);
    const tag = fromB64(tagB64);
    const ciphertext = fromB64(ctB64);

    const key = scryptSync(passphrase, salt, 32);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
}

export function looksLikeEncryptedPayload(s: string): boolean {
    if (typeof s !== "string") return false;
    if (!s.startsWith("v1:")) return false;
    const parts = s.split(":");
    return parts.length === 5;
}